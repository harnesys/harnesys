/**
 * Org API path guard shared by contracts, the server widget guard, and the
 * webui source client. Structure only: the guard proves a path is a plain
 * `/orgs/<orgId>/...` route with no traversal, encoding tricks, or control
 * characters. There is no resource allow-list (owner decision D2); the risky
 * prefix list below is a labeling aid, never a blocker.
 */

/** Resource families whose calls deserve a visible risk label in the UI. */
export const ORG_API_RISKY_PREFIXES: ReadonlySet<string> = new Set([
  'vault',
  'members',
  'providers',
  'accounts',
  'permission-rules',
  'permission-grants',
  'addons',
  'mcp',
  'connect',
  'secrets',
  'fleet',
]);

export interface OrgApiPathOk {
  ok: true;
  path: string;
}

export interface OrgApiPathError {
  ok: false;
  reason: string;
}

const ORG_API_PREFIX = '/orgs/';
const SEGMENT_PATTERN = /^[A-Za-z0-9_@.:~+-]+$/;
const ENCODED_SEPARATOR_PATTERN = /%2e|%2f|%5c/i;
const FORBIDDEN_CHARACTER_PATTERN = /[\s\\?#]/;

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code !== undefined && (code < 0x20 || code === 0x7f)) {
      return true;
    }
  }
  return false;
}

/**
 * Structural check without an org comparison: the path must start with
 * `/orgs/` and split into plain segments. `/orgs/<id>` alone is valid.
 */
export function parseOrgApiPathShape(raw: unknown): OrgApiPathOk | OrgApiPathError {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'path must be a string' };
  }
  if (!raw.startsWith(ORG_API_PREFIX)) {
    return { ok: false, reason: 'path must start with /orgs/' };
  }
  if (FORBIDDEN_CHARACTER_PATTERN.test(raw) || hasControlCharacter(raw)) {
    return { ok: false, reason: 'forbidden character' };
  }
  if (ENCODED_SEPARATOR_PATTERN.test(raw)) {
    return { ok: false, reason: 'forbidden character' };
  }
  const segments = raw.split('/').slice(1);
  for (const segment of segments) {
    if (segment.length === 0) {
      return { ok: false, reason: 'empty segment' };
    }
    if (segment === '.' || segment === '..') {
      return { ok: false, reason: 'path traversal segment' };
    }
    if (!SEGMENT_PATTERN.test(segment)) {
      return { ok: false, reason: 'forbidden character' };
    }
  }
  if (segments.length < 2) {
    return { ok: false, reason: 'path must name an org' };
  }
  return { ok: true, path: raw };
}

/**
 * Full guard: structure plus the org segment must equal the caller's org.
 * Never throws; callers decide how to surface the reason.
 */
export function parseOrgApiPath(raw: unknown, orgId: string): OrgApiPathOk | OrgApiPathError {
  const shape = parseOrgApiPathShape(raw);
  if (!shape.ok) {
    return shape;
  }
  const segments = shape.path.split('/');
  if (segments[2] !== orgId) {
    return { ok: false, reason: 'foreign org' };
  }
  return shape;
}

/** Third segment (resource family) when it sits in `ORG_API_RISKY_PREFIXES`. */
export function orgApiRiskPrefix(path: string): string | null {
  const resource = path.split('/')[3];
  if (resource === undefined || !ORG_API_RISKY_PREFIXES.has(resource.toLowerCase())) {
    return null;
  }
  return resource;
}

export function isRiskyOrgApiPath(path: string): boolean {
  return orgApiRiskPrefix(path) !== null;
}
