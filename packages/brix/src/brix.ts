import type { Server } from 'bun';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ConfigModule } from './config/config-module';
import { CONFIG } from './config/config-tokens';
import type { ConfigModuleOptions } from './config/config-types';
import type { ServerBinding } from './config/server-binding';
import { ServerBindingSchema } from './config/server-binding';
import { Container } from './di/container';
import { runModuleDestroy, runModuleInit } from './di/lifecycle';
import type { DynamicModule } from './di/module';
import { moduleRefOf } from './di/module-graph';
import type { ErrorMapper } from './errors/error-filter';
import { APP_FILTER, DefaultErrorFilter } from './errors/error-filter';
import type { HealthCheck } from './health/health';
import { collectHealthChecks, registerHealthRoutes } from './health/health';
import type { BrixEnv } from './http/context';
import { getTraceId } from './http/context';
import { buildHonoWithProviders, mapNotFound, resolveErrorMapper } from './http/hono-adapter';
import {
  observabilityMiddleware,
  requestContextMiddleware,
  traceMiddleware,
} from './http/middleware';
import { joinPaths } from './http/routes';
import { Logger, logBootstrap, type MappedRoute } from './logging/logger';
import { LoggingModule } from './logging/logging-module';
import { MetricsRegistry, registerMetricsRoutes } from './metrics/metrics';
import {
  buildOpenApiDocument,
  type OpenApiDocument,
  openApiInfoFromConfig,
  registerOpenApiRoutes,
  SYSTEM_OPENAPI_PATHS,
} from './openapi/openapi';

export interface BrixOptions {
  config?: ConfigModuleOptions;
}

export interface BrixAppInit<TConfig> {
  hono: Hono<BrixEnv>;
  container: Container;
  config: TConfig;
  binding: ServerBinding;
  api: Hono<BrixEnv>;
  logger: Logger;
  mapError: ErrorMapper;
  healthChecks: HealthCheck[];
  metrics: MetricsRegistry;
  moduleNames: string[];
  openApiDocument: OpenApiDocument;
}

export type ShutdownSignal = 'SIGTERM' | 'SIGINT';

export interface ServeOptions {
  port?: number;
  hostname?: string;
  shutdownTimeoutMs?: number;

  idleTimeout?: number;
  signals?: ShutdownSignal[];

  websocket?: object;
}

export type AppHandler = (request: Request) => Response | Promise<Response>;

interface SignalHandler {
  signal: ShutdownSignal;
  handler: () => Promise<void>;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNALS: ShutdownSignal[] = ['SIGTERM', 'SIGINT'];

function cancellableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}

async function stopServer(server: Server<unknown>, timeoutMs: number): Promise<void> {
  let drained = false;
  const stopping = server.stop().then(
    () => {
      drained = true;
    },
    () => {
      drained = true;
    },
  );
  const delay = cancellableDelay(timeoutMs);
  await Promise.race([stopping, delay.promise]);
  delay.cancel();
  if (!drained) {
    await server.stop(true);
  }
}

export class BrixApp<TConfig = Record<string, unknown>> {
  readonly hono: Hono<BrixEnv>;
  readonly container: Container;
  readonly config: TConfig;
  readonly binding: ServerBinding;
  private readonly api: Hono<BrixEnv>;
  private readonly logger: Logger;
  private readonly mapError: ErrorMapper;
  private readonly healthChecks: HealthCheck[];
  private readonly metrics: MetricsRegistry;
  private readonly moduleNames: string[];
  private readonly openApiDocument: OpenApiDocument;
  private readonly signalHandlers: SignalHandler[] = [];
  private served = false;
  private shuttingDown = false;
  private shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS;
  private server: Server<unknown> | undefined;
  private initPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;

  constructor(args: BrixAppInit<TConfig>) {
    this.hono = args.hono;
    this.container = args.container;
    this.config = args.config;
    this.binding = args.binding;
    this.api = args.api;
    this.logger = args.logger;
    this.mapError = args.mapError;
    this.healthChecks = args.healthChecks;
    this.metrics = args.metrics;
    this.moduleNames = args.moduleNames;
    this.openApiDocument = args.openApiDocument;
    this.hono.route(joinPaths(this.binding.api.prefix, this.binding.api.version), this.api);
    registerHealthRoutes(this.hono, {
      checks: this.healthChecks,
      shuttingDown: () => this.shuttingDown,
    });
    registerMetricsRoutes(this.hono, this.metrics);
    registerOpenApiRoutes(this.hono, this.openApiDocument);
    this.hono.notFound((c) => c.json(mapNotFound(c.req.path, getTraceId(c), this.mapError), 404));
    this.hono.onError((err, c) => {
      const body = this.mapError(err, {
        path: c.req.path,
        traceId: getTraceId(c),
      });
      return c.json(body, body.statusCode as ContentfulStatusCode);
    });
  }

  getHandler(): AppHandler {
    return this.hono.fetch;
  }

  init(): Promise<void> {
    if (this.initPromise === undefined) {
      this.initPromise = this.runInit();
    }
    return this.initPromise;
  }

  private async runInit(): Promise<void> {
    const instances = this.container.resolveAll();
    logBootstrap(this.logger, { moduleNames: this.moduleNames, routes: this.mappedRoutes() });
    await runModuleInit(instances);
  }

  private mappedRoutes(): MappedRoute[] {
    return this.hono.routes
      .filter((route) => route.method !== 'ALL' && route.method !== '*')
      .map((route) => ({ method: route.method, path: route.path }));
  }

  async serve(options: ServeOptions = {}): Promise<Server<unknown>> {
    if (this.served) {
      throw new Error('BrixApp.serve() called twice');
    }
    this.served = true;
    await this.init();
    const port = options.port ?? this.binding.port;
    const hostname = options.hostname ?? this.binding.host;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    const idleTimeout = options.idleTimeout;
    let server: Server<unknown>;
    try {
      server =
        options.websocket !== undefined
          ? Bun.serve({
              port,
              hostname,
              fetch: this.hono.fetch,
              idleTimeout,
              websocket: options.websocket as Bun.WebSocketHandler<undefined>,
            })
          : Bun.serve({ port, hostname, fetch: this.hono.fetch, idleTimeout });
    } catch (error) {
      await this.close();
      throw error;
    }
    this.server = server;
    this.registerSignalHandlers(options.signals ?? DEFAULT_SIGNALS);
    this.logger.info({ port, host: hostname }, '[server listening]');
    return server;
  }

  close(): Promise<void> {
    if (this.closePromise === undefined) {
      this.closePromise = this.runClose();
    }
    return this.closePromise;
  }

  private registerSignalHandlers(signals: ShutdownSignal[]): void {
    for (const signal of signals) {
      const handler = async (): Promise<void> => {
        await this.close();
        process.exit(0);
      };
      process.on(signal, handler);
      this.signalHandlers.push({ signal, handler });
    }
  }

  private removeSignalHandlers(): void {
    while (this.signalHandlers.length > 0) {
      const entry = this.signalHandlers.pop();
      if (entry !== undefined) {
        process.off(entry.signal, entry.handler);
      }
    }
  }

  private async runClose(): Promise<void> {
    this.shuttingDown = true;
    this.removeSignalHandlers();
    const server = this.server;
    if (server !== undefined) {
      this.server = undefined;
      await stopServer(server, this.shutdownTimeoutMs);
    }
    this.logger.info({}, '[server stopped]');
    try {
      await runModuleDestroy(this.container.instances());
    } catch (error) {
      this.logger.error({ err: error }, 'onModuleDestroy hooks failed');
    }
  }
}

function registerModuleDefaults(container: Container, dynamic: DynamicModule): void {
  for (const provider of dynamic.providers ?? []) {
    container.register(provider);
  }
}

export class Brix {
  static create<TConfig = Record<string, unknown>>(
    module: DynamicModule,
    options: BrixOptions = {},
  ): BrixApp<TConfig> {
    const container = new Container();
    registerModuleDefaults(container, ConfigModule.forRoot(options.config));
    registerModuleDefaults(container, LoggingModule.forRoot());
    container.register({ provide: APP_FILTER, useClass: DefaultErrorFilter });
    container.register(MetricsRegistry);
    const built = buildHonoWithProviders({ modules: [module], container });
    const healthChecks = collectHealthChecks(container, built.providers);
    const mapError = resolveErrorMapper(container);
    const rootRef = moduleRefOf(module);
    const config = container.resolveFrom<TConfig>(rootRef, CONFIG);
    const binding = ServerBindingSchema.parse((config as Record<string, unknown>).server);
    const logger = container.resolveFrom<Logger>(rootRef, Logger);
    const metrics = container.resolveFrom<MetricsRegistry>(rootRef, MetricsRegistry);

    const hono = new Hono<BrixEnv>();
    hono.use('*', requestContextMiddleware());
    hono.use('*', traceMiddleware());
    hono.use('*', observabilityMiddleware(logger, metrics));
    hono.use('*', cors());
    const openApiDocument = buildOpenApiDocument({
      info: openApiInfoFromConfig(config),
      controllers: built.controllers,
      apiBasePath: joinPaths(binding.api.prefix, binding.api.version),
      extraPaths: SYSTEM_OPENAPI_PATHS,
    });
    return new BrixApp({
      hono,
      container,
      config,
      binding,
      api: built.app,
      logger,
      mapError,
      healthChecks,
      metrics,
      moduleNames: [ConfigModule.name, LoggingModule.name, ...built.moduleNames],
      openApiDocument,
    });
  }
}
