import type { ServerWebSocket } from 'bun';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { isWebsocketUpgrade, upstreamWsUrl } from './proxy.ts';

interface ProxySocketData {
  upstream: WebSocket | null;
  upstreamUrl: string;
}

const config = loadConfig();
const app = createApp(config);

Bun.serve<ProxySocketData>({
  port: config.port,
  fetch(request, srv) {
    if (isWebsocketUpgrade(request) && new URL(request.url).pathname.startsWith('/api/')) {
      const upstreamUrl = upstreamWsUrl(request.url, config.upstreamOrigin);
      if (
        srv.upgrade(request, {
          data: { upstream: null, upstreamUrl },
        })
      ) {
        return;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      openUpstream(ws);
    },
    message(ws, message) {
      const upstream = ws.data.upstream;
      if (!upstream || upstream.readyState !== WebSocket.OPEN) {
        return;
      }
      upstream.send(message);
    },
    close(ws) {
      const upstream = ws.data.upstream;
      ws.data.upstream = null;
      if (upstream && upstream.readyState < WebSocket.CLOSING) {
        upstream.close();
      }
    },
  },
});

function openUpstream(ws: ServerWebSocket<ProxySocketData>): void {
  const upstream = new WebSocket(ws.data.upstreamUrl);
  ws.data.upstream = upstream;
  upstream.addEventListener('message', (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(event.data);
    }
  });
  upstream.addEventListener('close', (event) => {
    if (ws.readyState < WebSocket.CLOSING) {
      ws.close(event.code, event.reason);
    }
  });
  upstream.addEventListener('error', () => {
    if (ws.readyState < WebSocket.CLOSING) {
      ws.close(1011, 'upstream error');
    }
  });
}
