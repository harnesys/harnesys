import { IntegrationProviderErrorException } from '../../../domain/integration/integration.error.ts';
import type { GithubAppRegistration } from './github-app-config.ts';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GithubAppManifestInput {
  origin: string;
  name: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function buildGithubAppManifest(input: GithubAppManifestInput): Record<string, unknown> {
  const origin = input.origin.replace(/\/+$/, '');
  const host = new URL(origin).hostname;
  const isLoopback = LOOPBACK_HOSTS.has(host);
  return {
    name: input.name,
    url: origin,
    ...(isLoopback
      ? {}
      : {
          hook_attributes: {
            url: `${origin}/api/integrations/github/webhook`,
            active: false,
          },
        }),
    redirect_url: `${origin}/api/integrations/github/manifest`,
    callback_urls: [`${origin}/api/integrations/github/callback`],
    setup_url: `${origin}/api/integrations/github/callback`,
    setup_on_update: true,
    description: 'GitHub connector for the Harnesys instance at this address',
    public: false,
    default_permissions: {
      metadata: 'read',
      contents: 'write',
      issues: 'write',
      pull_requests: 'write',
      actions: 'write',
    },
  };
}

export function githubManifestUrl(ticket: string): string {
  return `https://github.com/settings/apps/new?state=${encodeURIComponent(ticket)}`;
}

export async function convertAppManifest(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(
    `${GITHUB_API_BASE}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'harnesys',
      },
    },
  );
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'github',
      `manifest conversion failed: HTTP ${res.status}`,
    );
  }
  return res.json();
}

export function parseAppConversion(payload: unknown, now: string): GithubAppRegistration | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const appId = Number(record.id);
  const privateKey = stringOf(record.pem);
  const slug = stringOf(record.slug);
  const clientId = stringOf(record.client_id);
  if (!Number.isInteger(appId) || appId <= 0 || !privateKey || !slug || !clientId) {
    return null;
  }
  return {
    appId: String(appId),
    privateKey,
    webhookSecret: stringOf(record.webhook_secret) ?? '',
    appSlug: slug,
    clientId,
    clientSecret: stringOf(record.client_secret) ?? '',
    registeredAt: now,
  };
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
