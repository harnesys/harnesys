import type { ContentDownload, ContentReadResult } from '../../domain/content/org-content.port.ts';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { proxyWorkerJson } from './worker-content-proxy.ts';

export function proxyRead(
  proxy: FleetContentProxyPort,
  hostId: string,
  sourceId: string,
  relPath: string,
  worktreeId?: string,
): Promise<ContentReadResult> {
  return proxyWorkerJson<{
    bytesBase64: string;
    etag: string;
    size: number;
    mtime: string;
  }>(proxy, hostId, {
    op: 'read',
    sourceId,
    relPath,
    ...(worktreeId ? { worktreeId } : {}),
  }).then((body) => ({
    bytes: Uint8Array.from(Buffer.from(body.bytesBase64, 'base64')),
    etag: body.etag,
    size: body.size,
    mtime: body.mtime,
  }));
}

export function proxyDownload(
  proxy: FleetContentProxyPort,
  hostId: string,
  sourceId: string,
  relPath: string,
  worktreeId?: string,
): Promise<ContentDownload> {
  return proxyWorkerJson<{ name: string; bytesBase64: string }>(proxy, hostId, {
    op: 'download',
    sourceId,
    relPath,
    ...(worktreeId ? { worktreeId } : {}),
  }).then((body) => ({
    name: body.name,
    bytes: Uint8Array.from(Buffer.from(body.bytesBase64, 'base64')),
  }));
}
