import type { Hono } from 'hono';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type { UnknownClass } from '../di/injectable';
import type { BrixEnv } from '../http/context';
import type { ParamDef } from '../http/params';
import type { RouteDef } from '../http/routes';
import { getRouteTable, joinPaths } from '../http/routes';

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export function openApiInfoFromConfig(config: unknown): OpenApiInfo {
  const app = (config as { app?: { name?: string; version?: string; description?: string } }).app;
  const info: OpenApiInfo = {
    title: app?.name ?? 'Harnesys',
    version: app?.version ?? '0.0.0',
  };
  if (app?.description !== undefined && app.description !== '') {
    info.description = app.description;
  }
  return info;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: Record<string, unknown>;
  description?: string;
}

export interface OpenApiMediaType {
  schema?: Record<string, unknown>;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content: Record<string, OpenApiMediaType>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
}

export type OpenApiPathItem = Partial<
  Record<'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head', OpenApiOperation>
>;

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: OpenApiInfo;
  paths: Record<string, OpenApiPathItem>;
}

export interface OpenApiExtraPath {
  method: string;
  path: string;
  summary?: string;
  tags?: string[];
  responses?: Record<string, OpenApiResponse>;
}

export const SYSTEM_OPENAPI_PATHS: OpenApiExtraPath[] = [
  { method: 'GET', path: '/health/live', summary: 'Liveness probe' },
  { method: 'GET', path: '/health/ready', summary: 'Readiness probe' },
  {
    method: 'GET',
    path: '/metrics',
    summary: 'Prometheus metrics',
    responses: { '200': { description: 'Prometheus text exposition' } },
  },
  { method: 'GET', path: '/openapi.json', summary: 'OpenAPI 3.1 document' },
];

export interface BuildOpenApiArgs {
  info: OpenApiInfo;
  controllers: UnknownClass[];
  apiBasePath?: string;
  extraPaths?: OpenApiExtraPath[];
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

export function toOpenApiPath(path: string): string {
  return path.replaceAll(/:([A-Za-z_][\w]*)/g, '{$1}');
}

export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(/:([A-Za-z_][\w]*)/g)) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

function zodSchemaObject(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _schema, ...rest } = json;
  return rest;
}

function queryParameters(schema: ZodType | undefined): OpenApiParameter[] {
  if (schema === undefined) {
    return [];
  }
  const json = zodSchemaObject(schema);
  if (json.type !== 'object' || typeof json.properties !== 'object' || json.properties === null) {
    return [
      {
        name: 'query',
        in: 'query',
        required: true,
        schema: json,
      },
    ];
  }
  const properties = json.properties as Record<string, Record<string, unknown>>;
  const required = Array.isArray(json.required)
    ? new Set(json.required.filter((item): item is string => typeof item === 'string'))
    : new Set<string>();
  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    in: 'query' as const,
    required: required.has(name),
    schema: propSchema,
  }));
}

function pathParameters(route: RouteDef): OpenApiParameter[] {
  const fromPath = pathParamNames(route.path);
  const named = new Set(
    route.params
      .filter((param) => param.kind === 'param' && param.name !== undefined)
      .map((param) => param.name as string),
  );
  const names = fromPath.length > 0 ? fromPath : [...named];
  return names.map((name) => ({
    name,
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
  }));
}

function bodySchema(params: ParamDef[]): ZodType | undefined {
  for (const param of params) {
    if (param.kind === 'body' && param.schema !== undefined) {
      return param.schema;
    }
  }
  return undefined;
}

function querySchema(params: ParamDef[]): ZodType | undefined {
  for (const param of params) {
    if (param.kind === 'query' && param.schema !== undefined) {
      return param.schema;
    }
  }
  return undefined;
}

function defaultStatus(route: RouteDef): string {
  if (route.httpCode !== undefined) {
    return String(route.httpCode);
  }
  return route.method === 'POST' ? '201' : '200';
}

function operationFromRoute(route: RouteDef, tag: string): OpenApiOperation {
  const parameters = [...pathParameters(route), ...queryParameters(querySchema(route.params))];
  const body = bodySchema(route.params);
  const status = defaultStatus(route);
  const operation: OpenApiOperation = {
    operationId: `${route.method.toLowerCase()}_${route.path.replaceAll(/[^\w]+/g, '_').replaceAll(/^_|_$/g, '')}`,
    tags: [tag],
    responses: {
      [status]: {
        description: status === '204' ? 'No content' : 'Success',
        ...(status === '204'
          ? {}
          : { content: { 'application/json': { schema: { type: 'object' } } } }),
      },
    },
  };
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }
  if (body !== undefined) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: zodSchemaObject(body),
        },
      },
    };
  } else if (route.params.some((param) => param.kind === 'body')) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object' },
        },
      },
    };
  }
  return operation;
}

function tagFromPath(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '' && !segment.startsWith(':'));
  return segments[0] ?? 'default';
}

function ensurePathItem(paths: Record<string, OpenApiPathItem>, path: string): OpenApiPathItem {
  const existing = paths[path];
  if (existing !== undefined) {
    return existing;
  }
  const created: OpenApiPathItem = {};
  paths[path] = created;
  return created;
}

function assignOperation(
  paths: Record<string, OpenApiPathItem>,
  method: string,
  path: string,
  operation: OpenApiOperation,
): void {
  const key = method.toLowerCase();
  if (!HTTP_METHODS.has(key)) {
    return;
  }
  const item = ensurePathItem(paths, path);
  item[key as keyof OpenApiPathItem] = operation;
}

export function buildOpenApiDocument(args: BuildOpenApiArgs): OpenApiDocument {
  const paths: Record<string, OpenApiPathItem> = {};
  const base = args.apiBasePath ?? '';

  for (const controller of args.controllers) {
    for (const route of getRouteTable(controller)) {
      const fullPath = toOpenApiPath(joinPaths(base, route.path));
      assignOperation(
        paths,
        route.method,
        fullPath,
        operationFromRoute(route, tagFromPath(route.path)),
      );
    }
  }

  for (const extra of args.extraPaths ?? []) {
    assignOperation(paths, extra.method, toOpenApiPath(extra.path), {
      summary: extra.summary,
      tags: extra.tags ?? ['system'],
      responses:
        extra.responses ??
        ({
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        } satisfies Record<string, OpenApiResponse>),
    });
  }

  return {
    openapi: '3.1.0',
    info: args.info,
    paths,
  };
}

export function registerOpenApiRoutes(app: Hono<BrixEnv>, document: OpenApiDocument): void {
  app.get('/openapi.json', (c) => c.json(document));
}
