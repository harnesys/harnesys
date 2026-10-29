import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import type { WebConfig } from './config.ts';

export function proxyApiRequest(c: Context, config: WebConfig): Promise<Response> | Response {
  const incoming = new URL(c.req.url);
  const target = new URL(incoming.pathname + incoming.search, config.upstreamOrigin);
  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  return proxy(target, {
    ...c.req,
    headers,
  });
}

export function upstreamWsUrl(requestUrl: string, upstreamOrigin: string): string {
  const incoming = new URL(requestUrl);
  const upstream = new URL(upstreamOrigin);
  const proto = upstream.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${upstream.host}${incoming.pathname}${incoming.search}`;
}

export function isWebsocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket';
}
