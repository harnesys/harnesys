import {
  DocumentRefResolver,
  extractParams,
  extractRequestBody,
  extractResponses,
  mergeParams,
  recordOf,
} from './extract.ts';
import type { CallMethod, HttpMethod, NormalizedOperation, ParseResult } from './types.ts';

const CALL_METHODS: readonly CallMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const SKIPPED_METHODS: readonly string[] = ['head', 'options', 'trace'];
const MAX_OPERATIONS = 1000;
const SUMMARY_LIMIT = 160;

export function parseOpenApiDocument(raw: unknown): ParseResult {
  const document = requireObject(raw, 'specification must be a JSON object');
  const version = detectVersion(document);
  const resolver = new DocumentRefResolver(document);
  const paths = requireObject(document.paths ?? null, 'specification has no paths object');
  const warnings: string[] = [];
  const operations: NormalizedOperation[] = [];
  const usedIds = new Set<string>();

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = requireObject(pathItemRaw, `paths.${path} must be an object`);
    warnings.push(...skippedWarnings(pathItem, path));
    const sharedParams = extractParams(pathItem.parameters, resolver);
    for (const method of CALL_METHODS) {
      const operationRaw = pathItem[method];
      if (operationRaw === undefined) {
        continue;
      }
      const operation = requireObject(operationRaw, `paths.${path}.${method} must be an object`);
      if (operations.length >= MAX_OPERATIONS) {
        warnings.push(`more than ${MAX_OPERATIONS} operations; the rest are skipped`);
        return { baseUrlHint: baseUrlHintOf(document, version), operations, warnings };
      }
      operations.push(
        buildOperation({
          path,
          method,
          pathItem,
          operation,
          sharedParams,
          resolver,
          warnings,
          usedIds,
        }),
      );
    }
  }
  if (operations.length === 0) {
    warnings.push('no callable operations found');
  }
  return { baseUrlHint: baseUrlHintOf(document, version), operations, warnings };
}

interface OperationBuildInput {
  path: string;
  method: CallMethod;
  pathItem: Record<string, unknown>;
  operation: Record<string, unknown>;
  sharedParams: ReturnType<typeof extractParams>;
  resolver: DocumentRefResolver;
  warnings: string[];
  usedIds: Set<string>;
}

function buildOperation(input: OperationBuildInput): NormalizedOperation {
  const { path, method, pathItem, operation, sharedParams, resolver, warnings, usedIds } = input;
  const params = mergeParams(sharedParams, extractParams(operation.parameters, resolver));
  const body = extractRequestBody(pathItem, operation, resolver);
  if (body.required && !body.json) {
    warnings.push(
      `operation '${path} ${method.toUpperCase()}' requires a request body without an application/json media type; body input is disabled`,
    );
  } else if (!body.json && body.schema === null && operation.requestBody !== undefined) {
    warnings.push(
      `operation '${path} ${method.toUpperCase()}' has no application/json media type; body input is disabled`,
    );
  }
  return {
    operationId: uniqueOperationId(operation, method, path, usedIds),
    method: method.toUpperCase() as HttpMethod,
    path,
    summary: summaryOf(operation),
    params,
    bodyRequired: body.required && body.json,
    bodySchema: body.json ? body.schema : null,
    responses: extractResponses(operation.responses, resolver),
  };
}

function detectVersion(document: Record<string, unknown>): '3.x' | '2.0' {
  const openapi = document.openapi;
  if (typeof openapi === 'string' && /^3\.\d+\.\d+/.test(openapi)) {
    return '3.x';
  }
  if (document.swagger === '2.0') {
    return '2.0';
  }
  throw new Error(
    'unsupported specification: expected OpenAPI 3.x (openapi) or Swagger 2.0 (swagger)',
  );
}

function skippedWarnings(pathItem: Record<string, unknown>, path: string): string[] {
  const skipped = SKIPPED_METHODS.filter((method) => pathItem[method] !== undefined);
  return skipped.length > 0 ? [`${skipped.join('/')} on ${path} was skipped (not callable)`] : [];
}

function baseUrlHintOf(document: Record<string, unknown>, version: '3.x' | '2.0'): string | null {
  return version === '3.x' ? serverHintOf(document) : hostHintOf(document);
}

function serverHintOf(document: Record<string, unknown>): string | null {
  const servers = Array.isArray(document.servers) ? document.servers : [];
  const first = recordOf(servers[0]);
  const url = first?.url;
  return typeof url === 'string' && !url.includes('{') ? url : null;
}

function hostHintOf(document: Record<string, unknown>): string | null {
  const host = document.host;
  if (typeof host !== 'string' || host.length === 0) {
    return null;
  }
  const schemes = Array.isArray(document.schemes) ? document.schemes : [];
  const scheme = typeof schemes[0] === 'string' ? (schemes[0] as string) : 'https';
  const basePath = typeof document.basePath === 'string' ? document.basePath : '';
  return `${scheme}://${host}${basePath}`;
}

function uniqueOperationId(
  operation: Record<string, unknown>,
  method: CallMethod,
  path: string,
  used: Set<string>,
): string {
  const declared =
    typeof operation.operationId === 'string'
      ? operation.operationId.replaceAll(/[^a-zA-Z0-9_]/g, '_')
      : '';
  const base = declared.length > 0 ? declared : synthesizedId(method, path);
  let candidate = base.length > 0 ? base : 'operation';
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function synthesizedId(method: CallMethod, path: string): string {
  const slug = path
    .replaceAll(/\{([^}]+)\}/g, '$1')
    .replaceAll(/[^a-zA-Z0-9_]/g, '_')
    .replaceAll(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${method}_${slug}`;
}

function summaryOf(operation: Record<string, unknown>): string {
  const raw = descriptionSourceOf(operation);
  const collapsed = raw.replaceAll(/\s+/g, ' ').trim();
  if (collapsed.length <= SUMMARY_LIMIT) {
    return collapsed;
  }
  return `${collapsed.slice(0, SUMMARY_LIMIT - 1)}…`;
}

function descriptionSourceOf(operation: Record<string, unknown>): string {
  if (typeof operation.summary === 'string' && operation.summary.length > 0) {
    return operation.summary;
  }
  return typeof operation.description === 'string' ? operation.description : '';
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}
