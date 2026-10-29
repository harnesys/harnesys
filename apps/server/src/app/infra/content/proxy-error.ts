import { ContentProxyException, HostOfflineException } from '../../domain/content/content.error.ts';

export function throwFromProxyBody(hostId: string, status: number, body: unknown): never {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const errorCode = typeof record.errorCode === 'string' ? record.errorCode : 'PROXY_FAILED';
    const message =
      typeof record.message === 'string' ? record.message : `content proxy failed (${status})`;
    if (errorCode === 'HOST_OFFLINE') {
      throw new HostOfflineException(hostId);
    }
    throw new ContentProxyException(status, errorCode, message, record.details);
  }
  throw new ContentProxyException(status, 'PROXY_FAILED', `content proxy failed (${status})`);
}
