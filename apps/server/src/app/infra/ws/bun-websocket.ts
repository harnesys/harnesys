import { createBunWebSocket } from 'hono/bun';

export const { upgradeWebSocket, websocket: bunWebsocket } = createBunWebSocket();
