export const ADDON_ID = 'harnesys.webhook';

export const TOKEN_PATTERN = /^[0-9a-f]{24}$/;

export function tokenFromPath(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? '';
}

export function publicEndpointPath(orgId: string, token: string): string {
  return `/addons/public/${orgId}/${ADDON_ID}/r/${token}`;
}

export function endpointUrl(orgId: string, token: string, headers: Record<string, string>): string {
  const path = publicEndpointPath(orgId, token);
  const origin = headers.origin ?? '';
  if (origin) {
    return `${origin.replace(/\/+$/, '')}${path}`;
  }
  const proto = headers['x-forwarded-proto'] ?? '';
  const forwardedHost = headers['x-forwarded-host'] ?? '';
  if (proto && forwardedHost) {
    return `${proto}://${forwardedHost}${path}`;
  }
  const host = headers.host ?? '';
  if (host) {
    return `://${host}${path}`;
  }
  return path;
}
