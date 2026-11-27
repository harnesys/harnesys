import { basename } from 'node:path';
import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { authInjectionFor } from './auth.ts';
import {
  assembleFileBytes,
  type MultipartFile,
  multipartPayload,
  parseFiles,
} from './multipart.ts';
import type { NormalizedParam, OperationSpec } from './openapi/types.ts';
import { parseResponseShape, shapeResponse } from './shape.ts';
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
  for (const [name, value] of Object.entries(result.path)) {
    if (value.length === 0) {
      delete result.path[name];
      result.missing.push(`${name} (path, non-empty value required)`);
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
  const multipart = spec.multipart === true;
  const files = await fileSources(ctx, input, multipart);
  const request = multipart
    ? multipartBody(spec, input.body, files)
    : jsonBody(operation.method, spec, input.body);
  const auth = await authInjectionFor(ctx, project);
  const url = withQuery(buildUrl(project.baseUrl, operation.pathTemplate, split.path), {
    ...split.query,
    ...auth.query,
  });
  const headers: Record<string, string> = { ...split.headers, ...auth.headers };
  if (request !== undefined) {
    headers['Content-Type'] = request.contentType;
  }
  const startedAt = Date.now();
  let response: HttpResponse;
  try {
    response = await ctx.http.fetch({
      url,
      method: operation.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      headers,
      ...(request?.text !== undefined ? { body: request.text } : {}),
      ...(request?.base64 !== undefined ? { bodyBase64: request.base64 } : {}),
    });
  } catch (error) {
    await ctx.log.warn(`api call failed: ${messageOf(error)}`, {
      project: project.name,
      operation: operation.operationId,
      url,
    });
    throw error;
  }
  const shape = parseResponseShape(input);
  await ctx.log.info('api call completed', {
    project: project.name,
    operation: operation.operationId,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return shapeResponse(ctx, operation.operationId, response, shape, 256 * 1024);
}

interface BodyPayload {
  text?: string;
  base64?: string;
  contentType: string;
}

const FILE_READ_CHUNK = 4 * 1024 * 1024;

async function fileSources(
  ctx: AddonContext,
  input: Record<string, unknown>,
  multipart: boolean,
): Promise<MultipartFile[]> {
  let files: MultipartFile[];
  try {
    files = await resolveFileSources(ctx, parseFiles(input.files));
  } catch (error) {
    if (error instanceof AddonError) {
      throw error;
    }
    throw new AddonError('invalid_params', { detail: messageOf(error) });
  }
  if (files.length > 0 && !multipart) {
    throw new AddonError('invalid_params', {
      detail: 'files are only supported for multipart/form-data operations; check api_docs',
    });
  }
  return files;
}

async function resolveFileSources(
  ctx: AddonContext,
  files: MultipartFile[],
): Promise<MultipartFile[]> {
  const resolved: MultipartFile[] = [];
  for (const file of files) {
    if (file.path === undefined) {
      resolved.push(file);
      continue;
    }
    const bytes = await assembleFileBytes(file.path, async (path, offset) => {
      try {
        return await ctx.files.read({ path, offset, length: FILE_READ_CHUNK });
      } catch (error) {
        if (error instanceof AddonError && error.reason === 'rate_limited') {
          throw new AddonError('rate_limited', {
            retryable: true,
            detail: `file read '${path}' is rate limited; wait a second and retry the same call`,
          });
        }
        throw new Error(
          `cannot read file '${path}': ${messageOf(error)}; pass an absolute host path or a file from the thread sandbox by its absolute path`,
        );
      }
    });
    resolved.push({
      ...file,
      path: undefined,
      contentBase64: Buffer.from(bytes).toString('base64'),
      ...(file.filename === undefined ? { filename: basename(file.path) } : {}),
    });
  }
  return resolved;
}

function multipartBody(
  spec: OperationSpec,
  body: unknown,
  files: MultipartFile[],
): BodyPayload | undefined {
  const fields = bodyFields(unwrapJsonText(body));
  if (fields === null) {
    throw new AddonError('invalid_params', {
      detail:
        'multipart operation: pass form fields as body (a flat object of strings) and files via the files parameter: [{name, path | content | contentBase64}]',
    });
  }
  if (Object.keys(fields).length === 0 && files.length === 0) {
    if (spec.bodyRequired) {
      throw new AddonError('invalid_params', {
        detail:
          'the operation requires form fields or files: body for fields, files for file content',
      });
    }
    return undefined;
  }
  const payload = multipartPayload(fields, files);
  return { base64: payload.bodyBase64, contentType: payload.contentType };
}

function bodyFields(body: unknown): Record<string, string> | null {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    fields[key] = scalarText(value);
  }
  return fields;
}

function jsonBody(method: string, spec: OperationSpec, body: unknown): BodyPayload | undefined {
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
  return { text: JSON.stringify(value), contentType: 'application/json' };
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
