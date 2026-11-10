import type { JsonObject } from '../../../../domain/apps/records.ts';

export function manifestPage(state: string, manifest: unknown): string {
  const encoded = escapeAttribute(JSON.stringify(manifest));
  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Create GitHub App</title></head><body><p>Redirecting to GitHub…</p><form id="f" method="post" action="${escapeAttribute(action)}"><input type="hidden" name="manifest" value="${encoded}"><button type="submit">Continue</button></form><script nonce="{{nonce}}">document.getElementById('f').submit();</script></body></html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function lowerHeader(headers: Record<string, string>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return null;
}

export function publicHookUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !isPublicHost(url.hostname)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return false;
  }
  if (host.includes(':')) {
    return !(
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    );
  }
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function parseBody(body: Uint8Array): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function asJsonObject(value: Record<string, unknown>): JsonObject {
  return value as JsonObject;
}

export function installationRef(parsed: Record<string, unknown>) {
  const installation = parsed.installation;
  if (!installation || typeof installation !== 'object') {
    return null;
  }
  const id = (installation as Record<string, unknown>).id;
  if (typeof id !== 'number') {
    return null;
  }
  return { kind: 'github-installation', externalAccountId: String(id) };
}

export function installationEffects(parsed: Record<string, unknown>) {
  if (parsed.action !== 'deleted') {
    return [];
  }
  const ref = installationRef(parsed);
  return ref ? [{ account: ref, status: 'expired' as const, error: 'revoked' as const }] : [];
}

export function githubEventType(parsed: Record<string, unknown>): string {
  const action = typeof parsed.action === 'string' ? parsed.action : 'updated';
  return `github.installation.${action}`;
}
