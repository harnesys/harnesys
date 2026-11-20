import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { authInjectionFor } from './auth.ts';
import type { NormalizedParam, OperationSpec } from './openapi/types.ts';
import { responsePayload } from './truncate.ts';
import type { HttpResponse, ProjectRecord } from './types.ts';
import { buildUrl, withQuery } from './url.ts';

export interface SplitParams {
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  missing: string[];
  unknown: string[];
}

export function splitOperationParams(
  spec: OperationSpec,
  input: Record<string, unknown>,
): SplitParams {
  const result: SplitParams = { path: {}, query: {}, headers: {}, missing: [], unknown: [] };
  const known = new Map(spec.params.map((param) => [param.name, param]));
  const headerNames = new Map(
    spec.params
      .filter((param) => param.in === 'header')
      .map((param) => [param.name.toLowerCase(), param]),
  );
  for (const [key, value] of Object.entries(input)) {
    const param = known.get(key) ?? headerNames.get(key.toLowerCase());
    if (param === undefined) {
      result.unknown.push(key);
      continue;
    }
    placeValue(result, param, value);
  }
  for (const param of spec.params) {
    if (param.required && !isProvided(param, input, result)) {
      result.missing.push(`${param.name} (${param.in})`);
    }
  }
  return result;
}

function placeValue(result: SplitParams, param: NormalizedParam, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  const text = scalarText(value);
  if (param.in === 'path') {
    result.path[param.name] = text;
  } else if (param.in === 'query') {
    result.query[param.name] = text;
  } else {
    result.headers[param.name] = text;
  }
}

function isProvided(
  param: NormalizedParam,
  input: Record<string, unknown>,
  result: SplitParams,
): boolean {
  const raw = input[param.name];
  if (raw === undefined || raw === null) {
    return param.in === 'header' && result.headers[param.name] !== undefined;
  }
  return param.in !== 'path' || result.path[param.name] !== undefined;
}

function scalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function requireAgent(ctx: AddonContext): string {
  const agentId = ctx.meta.agentId;
  if (agentId === undefined || agentId.length === 0) {
    throw new AddonError('permission_denied', {
      detail:
        'api tools must be called from an agent session (no agentId in call meta); grants cannot be checked',
    });
  }
  return agentId;
}

export async function executeCall(
  ctx: AddonContext,
  project: ProjectRecord,
  operation: { operationId: string; method: string; pathTemplate: string },
  spec: OperationSpec,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (project.baseUrl.length === 0) {
    throw new AddonError('invalid_params', { detail: `project '${project.name}' has no base URL` });
  }
  const paramsInput = recordOrEmpty(input.params);
  const split = splitOperationParams(spec, paramsInput);
  if (split.unknown.length > 0) {
    throw new AddonError('invalid_params', {
      detail: `unknown parameters: ${split.unknown.join(', ')}; expected: ${
        spec.params.map((param) => `${param.name} (${param.in})`).join(', ') || 'none'
      }`,
    });
  }
  if (split.missing.length > 0) {
    throw new AddonError('invalid_params', {
      detail: `missing required parameters: ${split.missing.join(', ')}`,
    });
  }
  const body = requestBodyText(operation.method, spec, input.body);
  const auth = await authInjectionFor(ctx, project);
  const url = withQuery(buildUrl(project.baseUrl, operation.pathTemplate, split.path), {
    ...split.query,
    ...auth.query,
  });
  const headers: Record<string, string> = { ...split.headers, ...auth.headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const startedAt = Date.now();
  let response: HttpResponse;
  try {
    response = await ctx.http.fetch({
      url,
      method: operation.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      headers,
      ...(body !== undefined ? { body } : {}),
    });
  } catch (error) {
    ctx.log.warn(`api call failed: ${messageOf(error)}`, {
      project: project.name,
      operation: operation.operationId,
      url,
    });
    throw error;
  }
  const maxBytes = 256 * 1024;
  const payload = responsePayload(response.body, contentTypeOf(response), maxBytes);
  ctx.log.info('api call completed', {
    project: project.name,
    operation: operation.operationId,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return {
    status: response.status,
    contentType: contentTypeOf(response) ?? null,
    responseHeaders: selectHeaders(response.headers),
    ...(payload.json !== undefined ? { body: payload.json } : { body: payload.text }),
  };
}

function requestBodyText(method: string, spec: OperationSpec, body: unknown): string | undefined {
  const value = unwrapJsonText(body);
  if (value === undefined || value === null) {
    if (spec.bodyRequired) {
      throw new AddonError('invalid_params', {
        detail:
          spec.bodySchema === null
            ? `${method} requires a request body but the operation has no application/json media type; the body cannot be sent`
            : `${method} requires a JSON body`,
      });
    }
    return undefined;
  }
  if (spec.bodySchema === null) {
    throw new AddonError('invalid_params', {
      detail: 'operation takes no JSON request body; remove body or check api_docs',
    });
  }
  return JSON.stringify(value);
}

/**
 * A JSON string that parses cleanly is a pre-serialized body (models often send
 * the payload as a quoted string): unwrap it so it is not encoded twice. A string
 * that does not parse is a legitimate JSON string payload and is sent as-is.
 */
function unwrapJsonText(body: unknown): unknown {
  if (typeof body !== 'string') {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function contentTypeOf(response: { headers: Record<string, string> }): string | undefined {
  const direct = response.headers['content-type'] ?? response.headers['Content-Type'];
  return direct;
}

function selectHeaders(headers: Record<string, string>): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === 'content-type' ||
      lower.startsWith('x-request-id') ||
      lower.startsWith('x-ratelimit') ||
      lower === 'retry-after'
    ) {
      selected[key] = value;
    }
  }
  return selected;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
