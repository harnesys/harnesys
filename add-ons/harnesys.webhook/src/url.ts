export const ADDON_ID = 'harnesys.webhook';

export const HOST_API_PREFIX = '/api';

export const TOKEN_PATTERN = /^[0-9a-f]{24}$/;

export function tokenFromPath(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? '';
}

export function publicEndpointPath(orgId: string, token: string): string {
  return `${HOST_API_PREFIX}/addons/public/${orgId}/${ADDON_ID}/r/${token}`;
}

function publicOriginOf(headers: Record<string, string>): string {
  const origin = headers.origin ?? '';
  if (origin && origin !== 'null') {
    return origin.replace(/\/+$/, '');
  }
  const proto = headers['x-forwarded-proto'] ?? 'http';
  const host = headers['x-forwarded-host'] ?? headers.host ?? '';
  return host ? `${proto}://${host}` : '';
}

export function endpointUrl(orgId: string, token: string, headers: Record<string, string>): string {
  return `${publicOriginOf(headers)}${publicEndpointPath(orgId, token)}`;
}
