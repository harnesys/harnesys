import type { FieldSpec } from '../../../../domain/apps/field.ts';
import type { ConnectResumeCtx } from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';

export const ORGANIZATION_FIELD = 'organization';

export function organizationFieldSpec(): FieldSpec {
  return {
    key: ORGANIZATION_FIELD,
    label: 'Organization',
    type: 'text',
    required: false,
    placeholder: 'my-organization',
    help: 'Leave empty to register the App on your personal account.',
    pattern: {
      regex: '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$',
      hint: 'Letters, digits and hyphens; cannot start or end with a hyphen.',
    },
  };
}

export function organizationOf(ctx: ConnectResumeCtx): string | undefined {
  const value = ctx.inputs[ORGANIZATION_FIELD];
  const organization = typeof value === 'string' ? value.trim() : '';
  return organization === '' ? undefined : organization;
}

export function manifestStateOf(ctx: ConnectResumeCtx): string {
  const value = ctx.sessionState.manifestState;
  return typeof value === 'string' ? value : '';
}

export function manifestOf(ctx: ConnectResumeCtx): Record<string, unknown> {
  const hookUrl = publicHookUrl(ctx.urls.webhookUrl);
  return {
    name: `Harnesys ${ctx.orgId.slice(0, 8)}`,
    url: 'https://github.com',
    redirect_url: ctx.urls.redirectUri,
    setup_url: ctx.urls.redirectUri,
    ...(hookUrl ? { hook_attributes: { url: hookUrl, active: true } } : {}),
    public: false,
    default_permissions: { contents: 'write', metadata: 'read', issues: 'write' },
  };
}

export function manifestPage(state: string, manifest: unknown, organization?: string): string {
  const encoded = escapeAttribute(JSON.stringify(manifest));
  const action = manifestAction(state, organization);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Create GitHub App</title></head><body><p>Redirecting to GitHub…</p><form id="f" method="post" action="${escapeAttribute(action)}"><input type="hidden" name="manifest" value="${encoded}"><button type="submit">Continue</button></form><script nonce="{{nonce}}">document.getElementById('f').submit();</script></body></html>`;
}

function manifestAction(state: string, organization?: string): string {
  const base = organization
    ? `https://github.com/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  return `${base}?state=${encodeURIComponent(state)}`;
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
