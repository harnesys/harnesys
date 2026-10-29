import { HttpException, Injectable } from '@harnesys/brix';
import type { ProxyRequest } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import {
  isWorkerContentPath,
  PROXY_CONTENT_TIMEOUT_MS,
} from '../content/worker-content.protocol.ts';

@Injectable()
export class FleetContentProxyAdapter extends FleetContentProxyPort {
  constructor(private readonly hub: FleetHubPort) {
    super();
  }

  async requestProxy(nodeId: string, request: ProxyRequest): Promise<Response> {
    if (!isWorkerContentPath(request.path) && !isAllowlistedContentApi(request.path)) {
      throw new HttpException(403, 'PROXY_PATH_DENIED', 'proxy path is not allowlisted');
    }
    if (!this.hub.hasPeer(nodeId)) {
      throw new HostOfflineException(nodeId);
    }
    try {
      const result = await this.hub.requestHttpProxy(
        nodeId,
        {
          method: request.method,
          path: request.path,
          body: request.body ?? null,
          contentType: request.contentType ?? null,
        },
        PROXY_CONTENT_TIMEOUT_MS,
      );
      const bytes = Buffer.from(result.body, 'base64');
      const headers = new Headers();
      headers.set('x-relayed-for', nodeId);
      if (result.contentType) {
        headers.set('Content-Type', result.contentType);
      }
      for (const [name, value] of Object.entries(result.headers ?? {})) {
        headers.set(name, value);
      }
      return new Response(bytes, { status: result.status, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'proxy_failed';
      if (message === 'proxy_offline') {
        throw new HostOfflineException(nodeId);
      }
      if (message === 'proxy_timeout') {
        throw new HttpException(504, 'PROXY_TIMEOUT', `content proxy timed out for ${nodeId}`);
      }
      throw new HttpException(502, 'PROXY_FAILED', message);
    }
  }
}

function isAllowlistedContentApi(path: string): boolean {
  const pathname = path.includes('?') ? path.slice(0, path.indexOf('?')) : path;
  return (
    /\/api\/orgs\/[^/]+\/sources\/[^/]+\/content\/(tree|read|write|mkdir|remove|stat)$/.test(
      pathname,
    ) || /\/api\/orgs\/[^/]+\/sources\/[^/]+\/worktrees$/.test(pathname)
  );
}
