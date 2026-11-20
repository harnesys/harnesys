import { convertSchema, type SchemaResolve } from './schema.ts';
import type {
  NormalizedOperation,
  NormalizedParam,
  OperationSpec,
  ParamLocation,
  ResponseDoc,
} from './types.ts';

export class DocumentRefResolver {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly document: Record<string, unknown>) {}

  resolve(ref: string): unknown {
    const cached = this.cache.get(ref);
    if (cached !== undefined || this.cache.has(ref)) {
      return cached;
    }
    const value = this.walk(ref);
    this.cache.set(ref, value);
    return value;
  }

  asSchemaResolve(): SchemaResolve {
    return (ref: string) => this.resolve(ref);
  }

  private walk(ref: string): unknown {
    if (!ref.startsWith('#/')) {
      return undefined;
    }
    let current: unknown = this.document;
    for (const rawSegment of ref.slice(2).split('/')) {
      const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~');
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
}

export interface ExtractedBody {
  required: boolean;
  json: boolean;
  schema: Record<string, unknown> | null;
}

const EMPTY_BODY: ExtractedBody = { required: false, json: false, schema: null };

export function extractParams(raw: unknown, resolver: DocumentRefResolver): NormalizedParam[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const params: NormalizedParam[] = [];
  for (const entry of raw) {
    const param = derefEntry(entry, resolver);
    if (param !== null) {
      params.push(param);
    }
  }
  return params;
}

export function mergeParams(
  shared: NormalizedParam[],
  local: NormalizedParam[],
): NormalizedParam[] {
  const merged = new Map<string, NormalizedParam>();
  for (const param of shared) {
    merged.set(`${param.in}:${param.name}`, param);
  }
  for (const param of local) {
    merged.set(`${param.in}:${param.name}`, param);
  }
  return [...merged.values()];
}

export function extractRequestBody(
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
  resolver: DocumentRefResolver,
): ExtractedBody {
  const openApiBody = resolveRequestBody(operation.requestBody ?? pathItem.requestBody, resolver);
  if (openApiBody !== null) {
    return openApiBody;
  }
  return (
    bodyParameterOf(operation.parameters, resolver) ??
    bodyParameterOf(pathItem.parameters, resolver) ??
    EMPTY_BODY
  );
}

export function extractResponses(raw: unknown, resolver: DocumentRefResolver): ResponseDoc[] {
  const responses = recordOf(raw);
  if (responses === null) {
    return [];
  }
  const list: ResponseDoc[] = [];
  for (const [status, entryRaw] of Object.entries(responses).slice(0, 20)) {
    const entry = derefValue(entryRaw, resolver);
    const description = typeof entry?.description === 'string' ? entry.description : undefined;
    list.push({ status, ...(description !== undefined ? { description } : {}) });
  }
  return list;
}

export function specOfOperation(
  operation: NormalizedOperation,
  withSchemas: boolean,
): OperationSpec {
  return {
    params: operation.params.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      ...(param.description !== undefined ? { description: param.description } : {}),
      ...(withSchemas && param.schema !== undefined ? { schema: param.schema } : {}),
    })),
    bodyRequired: operation.bodyRequired,
    bodySchema: withSchemas ? operation.bodySchema : null,
    responses: withSchemas ? operation.responses.slice(0, 10) : [],
  };
}

function derefEntry(entry: unknown, resolver: DocumentRefResolver): NormalizedParam | null {
  const param = derefValue(entry, resolver);
  if (param === null || isUnsupportedLocation(param.in)) {
    return null;
  }
  if (typeof param.name !== 'string' || param.name.length === 0) {
    return null;
  }
  return {
    name: param.name,
    in: param.in as ParamLocation,
    required: param.in === 'path' || param.required === true,
    ...(typeof param.description === 'string' ? { description: param.description } : {}),
    ...withSchema(paramSchemaOf(param, resolver)),
  };
}

function isUnsupportedLocation(location: unknown): boolean {
  return location !== 'path' && location !== 'query' && location !== 'header';
}

function paramSchemaOf(
  param: Record<string, unknown>,
  resolver: DocumentRefResolver,
): Record<string, unknown> | null {
  const convert = schemaConverter(resolver);
  if (param.schema !== undefined) {
    return convert(param.schema);
  }
  const content = recordOf(param.content);
  if (content === null) {
    return convert(param);
  }
  const media = pickJsonMedia(content);
  return media === null ? null : convert(media.schema);
}

function resolveRequestBody(raw: unknown, resolver: DocumentRefResolver): ExtractedBody | null {
  const source = derefValue(raw, resolver);
  if (source === null) {
    return null;
  }
  const required = source.required === true;
  const media = pickJsonMedia(recordOf(source.content) ?? {});
  if (media === null) {
    return { required, json: false, schema: null };
  }
  return { required, json: true, schema: schemaConverter(resolver)(media.schema) };
}

function bodyParameterOf(raw: unknown, resolver: DocumentRefResolver): ExtractedBody | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  for (const entry of raw) {
    const param = derefValue(entry, resolver);
    if (param !== null && param.in === 'body') {
      return {
        required: param.required === true,
        json: true,
        schema: schemaConverter(resolver)(param.schema),
      };
    }
  }
  return null;
}

function pickJsonMedia(content: Record<string, unknown>): Record<string, unknown> | null {
  const json = recordOf(content['application/json']);
  if (json !== null) {
    return json;
  }
  for (const [mediaType, media] of Object.entries(content)) {
    if (mediaType.endsWith('+json')) {
      return recordOf(media);
    }
  }
  return null;
}

function derefValue(entry: unknown, resolver: DocumentRefResolver): Record<string, unknown> | null {
  let source = entry;
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    const ref = (entry as Record<string, unknown>).$ref;
    if (typeof ref === 'string') {
      source = resolver.resolve(ref);
    }
  }
  return recordOf(source);
}

function schemaConverter(
  resolver: DocumentRefResolver,
): (raw: unknown) => Record<string, unknown> | null {
  return (raw: unknown) => convertSchema(raw, resolver.asSchemaResolve());
}

function withSchema(
  schema: Record<string, unknown> | null,
): { schema: Record<string, unknown> } | Record<string, never> {
  return schema === null ? {} : { schema };
}

export function recordOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
