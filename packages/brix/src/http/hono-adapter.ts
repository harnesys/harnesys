import 'reflect-metadata';
import { Hono } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { type Container, type Provider, resolveMultiProviders } from '../di/container';
import type { UnknownClass } from '../di/injectable';
import type { DynamicModule } from '../di/module';
import { buildModuleGraph, describeToken } from '../di/module-graph';
import { ForbiddenException, UnauthorizedException } from '../errors/domain-exception';
import type { ErrorMapper, ErrorResponse } from '../errors/error-filter';
import { APP_FILTER, type ErrorFilter, mapToErrorResponse } from '../errors/error-filter';
import { BadRequestException, NotFoundException } from '../errors/http-exception';
import type { CanActivate } from '../guards/can-activate';
import { createGuardContext, runGuards } from '../guards/can-activate';
import { APP_GUARD, getGuardClasses, IS_PUBLIC_KEY, isPublic } from '../guards/decorators';
import { HEALTH_CHECK } from '../health/health';
import { validateWithSchema } from '../validation/zod-pipe';
import type { BrixContext, BrixEnv } from './context';
import { getTraceId } from './context';
import type { ParamDef } from './params';
import { collapseQueryParams } from './params';
import type { RouteDef } from './routes';
import { getRouteTable, joinPaths } from './routes';

export type NotFoundBody = ErrorResponse;

export type ForbiddenBody = ErrorResponse;

export function mapForbidden(
  path: string,
  traceId?: string,
  map: ErrorMapper = mapToErrorResponse,
): ForbiddenBody {
  return map(new ForbiddenException('Forbidden'), { path, traceId });
}

export function mapNotFound(
  path: string,
  traceId?: string,
  map: ErrorMapper = mapToErrorResponse,
): NotFoundBody {
  return map(new NotFoundException(`Route ${path} not found`), { path, traceId });
}

export function resolveErrorMapper(container: Container): ErrorMapper {
  if (!container.has(APP_FILTER)) {
    return mapToErrorResponse;
  }
  const filter = container.resolve<ErrorFilter>(APP_FILTER);
  return (err, args) => filter.map(err, args);
}

type Handler = (...args: unknown[]) => unknown;

async function readBody(c: BrixContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new BadRequestException('Invalid JSON body', { issues: [] });
  }
}

async function resolveArguments(c: BrixContext, params: ParamDef[]): Promise<unknown[]> {
  const args: unknown[] = [];
  for (const param of params) {
    if (param.kind === 'body') {
      args[param.index] = validateWithSchema(param.schema, await readBody(c), 'body');
    } else if (param.kind === 'param') {
      args[param.index] = param.name === undefined ? c.req.param() : c.req.param(param.name);
    } else if (param.kind === 'query') {
      args[param.index] = validateWithSchema(
        param.schema,
        collapseQueryParams(c.req.queries()),
        'query',
      );
    } else if (param.kind === 'custom' && param.factory !== undefined) {
      args[param.index] = await param.factory(param.data, { request: c.req.raw, context: c });
    } else {
      args[param.index] = c;
    }
  }
  return args;
}

export type ResponsePlan =
  | { kind: 'response'; response: Response }
  | { kind: 'empty'; status: number }
  | { kind: 'json'; status: number; value: unknown };

export function planResponse(result: unknown, route: RouteDef): ResponsePlan {
  if (result instanceof Response) {
    return { kind: 'response', response: result };
  }
  if (route.httpCode === 204 || route.httpCode === 304) {
    return { kind: 'empty', status: route.httpCode };
  }
  if (result === undefined) {
    return { kind: 'empty', status: route.httpCode ?? 204 };
  }
  return {
    kind: 'json',
    status: route.httpCode ?? (route.method === 'POST' ? 201 : 200),
    value: result,
  };
}

function toResponse(c: BrixContext, plan: ResponsePlan): Response {
  if (plan.kind === 'response') {
    return plan.response;
  }
  if (plan.kind === 'empty') {
    return c.body(null, plan.status as StatusCode);
  }
  return c.json(plan.value, plan.status as ContentfulStatusCode);
}

function resolveGlobalGuards(container: Container, providers: Provider[]): CanActivate[] {
  return resolveMultiProviders<CanActivate>(container, providers, APP_GUARD);
}

function resolveRouteGuards(
  container: Container,
  controller: UnknownClass,
  handlerName: string,
): CanActivate[] {
  return getGuardClasses(controller, handlerName).map((guard) => {
    container.register(guard);
    return container.resolve<CanActivate>(guard);
  });
}

interface GuardRunOptions {
  c: BrixContext;
  guards: CanActivate[];
  mapError: ErrorMapper;
  traceId: string | undefined;
  routeIsPublic: boolean;
}

async function applyGuards(options: GuardRunOptions): Promise<Response | undefined> {
  if (options.routeIsPublic) {
    options.c.set(IS_PUBLIC_KEY, true);
    return undefined;
  }
  if (options.guards.length === 0) {
    return undefined;
  }
  const guardContext = createGuardContext(options.c.req.raw, {
    get: (key) => options.c.get(key),
    set: (key, value) => {
      options.c.set(key, value);
    },
  });
  const outcome = await runGuards(guardContext, options.guards);
  if (outcome.kind === 'denied') {
    const body = options.mapError(new UnauthorizedException('Unauthorized'), {
      path: options.c.req.path,
      traceId: options.traceId,
    });
    return options.c.json(body, 401);
  }
  return outcome.kind === 'response' ? outcome.response : undefined;
}

interface RegisterOptions {
  container: Container;
  controller: UnknownClass;
  moduleRef: UnknownClass;
  globalGuards: CanActivate[];
  mapError: ErrorMapper;
}

function hasProtectedRoute(controllers: UnknownClass[]): boolean {
  for (const controller of controllers) {
    for (const route of getRouteTable(controller)) {
      if (!isPublic(controller, route.handlerName)) {
        return true;
      }
    }
  }
  return false;
}

function registerController(app: Hono<BrixEnv>, options: RegisterOptions): void {
  const instance = options.container.resolveFrom<Record<string, unknown>>(
    options.moduleRef,
    options.controller,
  );
  for (const route of getRouteTable(options.controller)) {
    const handlerName = route.handlerName;
    const routeIsPublic = isPublic(options.controller, handlerName);
    const guards =
      routeIsPublic === true
        ? []
        : [
            ...options.globalGuards,
            ...resolveRouteGuards(options.container, options.controller, handlerName),
          ];
    app.on(route.method, joinPaths(route.path), async (c) => {
      const traceId = getTraceId(c);
      try {
        const target = instance[handlerName];
        if (typeof target !== 'function') {
          throw new Error(`Handler ${handlerName} not found`);
        }
        const guardResult = await applyGuards({
          c,
          guards,
          mapError: options.mapError,
          traceId,
          routeIsPublic,
        });
        if (guardResult !== undefined) {
          return guardResult;
        }
        const args = await resolveArguments(c, route.params);
        return toResponse(
          c,
          planResponse(await Reflect.apply(target as Handler, instance, args), route),
        );
      } catch (err) {
        const body = options.mapError(err, { path: c.req.path, traceId });
        return c.json(body, body.statusCode as ContentfulStatusCode);
      }
    });
  }
}

export interface HonoBuild {
  app: Hono<BrixEnv>;
  providers: Provider[];
  moduleNames: string[];
  controllers: UnknownClass[];
}

export function buildHonoWithProviders(args: {
  modules: Array<UnknownClass | DynamicModule>;
  container: Container;
}): HonoBuild {
  const app = new Hono<BrixEnv>();
  const graph = buildModuleGraph(args.modules, { multi: [APP_GUARD, HEALTH_CHECK] });
  args.container.registerModules(graph);
  const mapError = resolveErrorMapper(args.container);
  const controllers: UnknownClass[] = [];
  const providers: Provider[] = [];
  for (const node of graph.nodes) {
    controllers.push(...node.controllers);
    providers.push(...node.providers);
  }
  const globalGuards = hasProtectedRoute(controllers)
    ? resolveGlobalGuards(args.container, providers)
    : [];
  for (const node of graph.nodes) {
    for (const controller of node.controllers) {
      registerController(app, {
        container: args.container,
        controller,
        moduleRef: node.ref,
        globalGuards,
        mapError,
      });
    }
  }
  app.notFound((c) => c.json(mapNotFound(c.req.path, getTraceId(c), mapError), 404));
  return {
    app,
    providers,
    moduleNames: graph.nodes.map((node) => describeToken(node.ref)),
    controllers,
  };
}

export function buildHono(args: {
  modules: Array<UnknownClass | DynamicModule>;
  container: Container;
}): Hono<BrixEnv> {
  return buildHonoWithProviders(args).app;
}
