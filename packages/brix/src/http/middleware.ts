import type { MiddlewareHandler } from 'hono';
import { Logger, logRequest } from '../logging/logger';
import type { MetricsRegistry } from '../metrics/metrics';
import {
  type BrixEnv,
  createRequestContext,
  createTraceId,
  getTraceId,
  runWithRequestContext,
  TRACE_ID_KEY,
} from './context';

export function requestContextMiddleware(): MiddlewareHandler<BrixEnv> {
  return (c, next) =>
    runWithRequestContext(
      createRequestContext(c.req.raw, {
        get: (key) => c.get(key),
        set: (key, value) => {
          c.set(key, value);
        },
      }),
      () => next(),
    );
}

export function traceMiddleware(): MiddlewareHandler<BrixEnv> {
  return async (c, next) => {
    const traceId = createTraceId(c.req.header('x-request-id'));
    c.set(TRACE_ID_KEY, traceId);
    c.header('x-request-id', traceId);
    await next();
  };
}

export function observabilityMiddleware(
  logger: Logger,
  metrics: MetricsRegistry,
): MiddlewareHandler<BrixEnv> {
  const log = logger.child('Http');
  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;
    const statusCode = c.res.status;
    metrics.observeRequest({
      method: c.req.method,
      route: c.req.routePath ?? 'unmatched',
      statusCode,
      durationMs,
    });
    logRequest(log, {
      method: c.req.method,
      path: c.req.path,
      statusCode,
      durationMs,
      traceId: getTraceId(c),
    });
  };
}
