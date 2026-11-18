import type { ProxyRequest } from '@harnesys/contracts';
import { ContentProxyException, HostOfflineException } from '../../domain/content/content.error.ts';
import {
  WORKER_CONTENT_PATH,
  type WorkerContentRequest,
} from '../../domain/content/worker-content.protocol.ts';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { throwFromProxyBody } from './proxy-error.ts';

export async function proxyWorkerJson<T>(
  proxy: FleetContentProxyPort,
  hostId: string,
  req: WorkerContentRequest,
): Promise<T> {
  const request: ProxyRequest = {
    method: 'POST',
    path: WORKER_CONTENT_PATH,
    body: JSON.stringify(req),
    contentType: 'application/json',
  };
  let response: Response;
  try {
    response = await proxy.requestProxy(hostId, request);
  } catch (err) {
    if (err instanceof HostOfflineException) {
      throw err;
    }
    throw new ContentProxyException(
      502,
      'PROXY_FAILED',
      err instanceof Error ? err.message : 'proxy failed',
    );
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    throwFromProxyBody(hostId, response.status, parsed);
  }
  return parsed as T;
}
