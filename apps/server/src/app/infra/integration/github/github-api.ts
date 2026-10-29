import { IntegrationProviderErrorException } from '../../../domain/integration/integration.error.ts';
import type { FetchLike } from './installation-token.ts';

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const DIFF_ACCEPT = 'application/vnd.github.diff';
const EXCERPT_LIMIT = 300;

export interface GithubApiCall {
  token: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  accept?: string;
}

export async function githubApiJson<T>(
  call: GithubApiCall,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const res = await fetchImpl(`${GITHUB_API_BASE}${withQuery(call.path, call.query)}`, {
    method: call.method,
    headers: githubHeaders(call.token, call.accept),
    ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
  });
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'github',
      `${call.method} ${call.path} failed: ${res.status} ${excerptOf(await res.text())}`,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function githubApiText(
  call: GithubApiCall,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const res = await fetchImpl(`${GITHUB_API_BASE}${withQuery(call.path, call.query)}`, {
    method: call.method,
    headers: githubHeaders(call.token, call.accept ?? DIFF_ACCEPT),
  });
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'github',
      `${call.method} ${call.path} failed: ${res.status} ${excerptOf(await res.text())}`,
    );
  }
  return res.text();
}

export interface GithubInstallationInfo {
  installationId: number;
  accountLogin: string;
  appSlug: string | null;
  permissions: Record<string, string>;
}

export async function getInstallation(
  jwt: string,
  installationId: number,
  fetchImpl: FetchLike = fetch,
): Promise<GithubInstallationInfo> {
  const res = await fetchImpl(`${GITHUB_API_BASE}/app/installations/${installationId}`, {
    headers: githubHeaders(jwt),
  });
  const json: unknown = await res.json();
  if (!res.ok || !isRecord(json)) {
    throw new IntegrationProviderErrorException(
      'github',
      `get installation failed: HTTP ${res.status} ${excerptOf(JSON.stringify(json))}`,
    );
  }
  return {
    installationId: Number(json.id),
    accountLogin: stringField(isRecord(json.account) ? json.account : {}, 'login') ?? '',
    appSlug: stringField(json, 'app_slug'),
    permissions: stringRecord(json.permissions),
  };
}

export async function getAppInfo(
  jwt: string,
  fetchImpl: FetchLike = fetch,
): Promise<GithubAppInfo> {
  const res = await fetchImpl(`${GITHUB_API_BASE}/app`, { headers: githubHeaders(jwt) });
  if (!res.ok) {
    throw new IntegrationProviderErrorException('github', `get app failed: HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  if (!isRecord(json)) {
    throw new IntegrationProviderErrorException('github', 'get app returned invalid payload');
  }
  return {
    appId: Number(json.id),
    slug: stringField(json, 'slug') ?? '',
    name: stringField(json, 'name') ?? '',
  };
}

export interface GithubAppInfo {
  appId: number;
  slug: string;
  name: string;
}

export async function listAppInstallations(
  jwt: string,
  fetchImpl: FetchLike = fetch,
): Promise<GithubInstallationInfo[]> {
  const res = await fetchImpl(`${GITHUB_API_BASE}/app/installations?per_page=100`, {
    headers: githubHeaders(jwt),
  });
  const json: unknown = await res.json();
  if (!res.ok || !Array.isArray(json)) {
    throw new IntegrationProviderErrorException(
      'github',
      `list installations failed: HTTP ${res.status} ${excerptOf(JSON.stringify(json))}`,
    );
  }
  return json.map((entry) => {
    const record = isRecord(entry) ? entry : {};
    return {
      installationId: Number(record.id),
      accountLogin: stringField(isRecord(record.account) ? record.account : {}, 'login') ?? '',
      appSlug: stringField(record, 'app_slug'),
      permissions: stringRecord(record.permissions),
    };
  });
}

export function githubHeaders(
  token: string,
  accept = 'application/vnd.github+json',
): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'harnesys',
  };
}

export function splitRepo(repo: string): [string, string] {
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new IntegrationProviderErrorException('github', `invalid repo id: ${repo}`);
  }
  return [owner, name];
}

export function withQuery(path: string, query?: URLSearchParams): string {
  if (!query) {
    return path;
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      output[key] = entry;
    }
  }
  return output;
}

function excerptOf(text: string): string {
  return text.slice(0, EXCERPT_LIMIT);
}
