import { Hono } from 'hono';
import type { WebConfig } from './config.ts';
import { proxyApiRequest } from './proxy.ts';
import { createStaticHandler } from './static.ts';

export function createApp(config: WebConfig): Hono {
  const app = new Hono();
  const serveStatic = createStaticHandler(config.staticDir);
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.all('/api/*', (c) => proxyApiRequest(c, config));
  app.get('*', async (c) => serveStatic(new URL(c.req.url).pathname));
  return app;
}
