import { isWorkerContentPath } from '../content/worker-content.protocol.ts';

export interface WorkerSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface ProxyResultPayload {
  status: number;
  body: string;
  contentType: string | null;
  headers: Record<string, string> | null;
}

export interface HttpProxyCommand {
  type: 'HTTP_PROXY';
  requestId: string;
  method: string;
  path: string;
  body?: string | null;
  contentType?: string | null;
}

export function openWorkerSocket(url: string): WorkerSocket {
  return new WebSocket(url) as WorkerSocket;
}

export function workerWsUrl(relayUrl: string): string {
  const base = relayUrl.replace(/\/+$/, '');
  if (base.startsWith('https://')) {
    return `${base.replace(/^https/, 'wss')}/api/fleet/worker`;
  }
  if (base.startsWith('http://')) {
    return `${base.replace(/^http/, 'ws')}/api/fleet/worker`;
  }
  return `ws://${base}/api/fleet/worker`;
}

export function isHttpProxyCommand(value: unknown): value is HttpProxyCommand {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'HTTP_PROXY' &&
    typeof record.requestId === 'string' &&
    typeof record.method === 'string' &&
    typeof record.path === 'string'
  );
}

export function deniedPathResult(): ProxyResultPayload {
  return {
    status: 403,
    body: Buffer.from(
      JSON.stringify({
        statusCode: 403,
        errorCode: 'PROXY_PATH_DENIED',
        message: 'proxy path is not allowlisted',
      }),
    ).toString('base64'),
    contentType: 'application/json',
    headers: null,
  };
}

export function failedProxyResult(): ProxyResultPayload {
  return {
    status: 502,
    body: Buffer.from(
      JSON.stringify({ errorCode: 'PROXY_FAILED', message: 'proxy_failed' }),
    ).toString('base64'),
    contentType: 'application/json',
    headers: null,
  };
}

export async function executeAllowlistedProxy(
  command: HttpProxyCommand,
  handleBody: (raw: string | null) => Promise<ProxyResultPayload>,
): Promise<ProxyResultPayload> {
  if (!isWorkerContentPath(command.path)) {
    return deniedPathResult();
  }
  return handleBody(command.body ?? null);
}

export async function sendWorkerProxyResult(
  orgId: string,
  socket: { send: (payload: string) => void } | null,
  command: HttpProxyCommand,
  handleContent: (
    orgId: string,
    raw: string | null | undefined,
  ) => Promise<{
    status: number;
    body: string;
    contentType: string | null;
    headers?: Record<string, string> | null;
  }>,
  onError: (message: string) => void,
): Promise<void> {
  let proxyResult: ProxyResultPayload;
  try {
    proxyResult = await executeAllowlistedProxy(command, async (raw) => {
      const handled = await handleContent(orgId, raw);
      return {
        status: handled.status,
        body: handled.body,
        contentType: handled.contentType,
        headers: handled.headers ?? null,
      };
    });
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
    proxyResult = failedProxyResult();
  }
  try {
    socket?.send(
      JSON.stringify({
        kind: 'HTTP_PROXY_RESULT',
        requestId: command.requestId,
        result: proxyResult,
      }),
    );
  } catch {
    // ignore
  }
}
