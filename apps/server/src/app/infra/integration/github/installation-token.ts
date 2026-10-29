const GITHUB_API_BASE = 'https://api.github.com';
const EXPIRY_SKEW_MS = 60_000;
const CACHE_TTL_MS = 5 * 60_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type ClockLike = () => number;

export interface InstallationToken {
  token: string;
  expiresAt: number;
  permissions: Readonly<Record<string, string>>;
}

export interface InstallationTokenRequest {
  integrationId: string;
  installationId: number;
  jwt: string;
}

export async function exchangeInstallationToken(
  request: InstallationTokenRequest,
  fetchImpl: FetchLike = fetch,
): Promise<InstallationToken> {
  const res = await fetchImpl(
    `${GITHUB_API_BASE}/app/installations/${request.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${request.jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  const json: unknown = await res.json();
  if (!res.ok || !isTokenResponse(json)) {
    throw new Error(`installation token exchange failed: HTTP ${res.status}`);
  }
  return {
    token: json.token,
    expiresAt: Date.parse(json.expires_at),
    permissions: readPermissions(json.permissions),
  };
}

export class InstallationTokenStore {
  private readonly cache = new Map<string, InstallationToken>();

  constructor(
    private readonly inject: {
      fetchImpl?: FetchLike;
      clock?: ClockLike;
    } = {},
  ) {}

  async get(request: InstallationTokenRequest): Promise<InstallationToken> {
    const now = this.clock();
    const cached = this.cache.get(request.integrationId);
    if (cached && cached.expiresAt - EXPIRY_SKEW_MS > now) {
      return cached;
    }
    const fresh = await exchangeInstallationToken(request, this.fetchImpl);
    const token: InstallationToken = {
      ...fresh,
      expiresAt: Math.min(fresh.expiresAt, now + CACHE_TTL_MS),
    };
    this.cache.set(request.integrationId, token);
    return token;
  }

  invalidate(integrationId: string): void {
    this.cache.delete(integrationId);
  }

  private get clock(): ClockLike {
    return this.inject.clock ?? Date.now;
  }

  private get fetchImpl(): FetchLike {
    return this.inject.fetchImpl ?? fetch;
  }
}

function isTokenResponse(value: unknown): value is {
  token: string;
  expires_at: string;
  permissions?: unknown;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.token === 'string' && typeof record.expires_at === 'string';
}

function readPermissions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      output[key] = entry;
    }
  }
  return output;
}
