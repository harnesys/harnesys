import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { secretKeyFor } from './store.ts';
import type { AuthKind, ProjectRecord } from './types.ts';
import { withQuery } from './url.ts';

export interface AuthInjection {
  headers: Record<string, string>;
  query: Record<string, string>;
}

export function buildAuth(
  kind: AuthKind,
  authParam: string | null,
  token: string,
  user: string | null,
): AuthInjection {
  if (kind === 'none') {
    return { headers: {}, query: {} };
  }
  if (kind === 'bearer') {
    return { headers: { Authorization: `Bearer ${token}` }, query: {} };
  }
  if (kind === 'basic') {
    const credentials = `${user ?? ''}:${token}`;
    return { headers: { Authorization: `Basic ${toBase64(credentials)}` }, query: {} };
  }
  if (kind === 'header') {
    return { headers: { [authParam ?? 'X-Api-Key']: token }, query: {} };
  }
  return { headers: {}, query: { [authParam ?? 'api_key']: token } };
}

export async function authInjectionFor(
  ctx: AddonContext,
  project: ProjectRecord,
): Promise<AuthInjection> {
  if (project.authKind === 'none') {
    return { headers: {}, query: {} };
  }
  const token = await ctx.secrets.get(secretKeyFor(project.id, 'token'));
  if (token === null || token.length === 0) {
    throw new AddonError('account_failed', {
      detail: `project '${project.name}' has no token set; add it on the project page`,
    });
  }
  if (project.authKind === 'basic') {
    const user = await ctx.secrets.get(secretKeyFor(project.id, 'user'));
    if (user === null || user.length === 0) {
      throw new AddonError('account_failed', {
        detail: `project '${project.name}' uses basic auth but no user is set`,
      });
    }
    return buildAuth('basic', project.authParam, token, user);
  }
  return buildAuth(project.authKind, project.authParam, token, null);
}

export interface ConnectionTestResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

export async function testConnection(
  ctx: AddonContext,
  project: ProjectRecord,
): Promise<ConnectionTestResult> {
  if (project.baseUrl.length === 0) {
    return { ok: false, status: null, latencyMs: 0, error: 'project has no base URL' };
  }
  const startedAt = Date.now();
  try {
    const auth = await authInjectionFor(ctx, project);
    const url = withQuery(`${project.baseUrl.replaceAll(/\/+$/g, '')}/`, auth.query);
    const response = await ctx.http.fetch({ url, method: 'GET', headers: { ...auth.headers } });
    return {
      ok: response.status < 500,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toBase64(text: string): string {
  return typeof btoa === 'function' ? btoa(text) : Buffer.from(text, 'utf8').toString('base64');
}
