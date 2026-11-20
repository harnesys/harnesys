import type { AddonContext, DbRow } from '@harnesys/sdk';
import type { AuthKind, ProjectRow } from './types.ts';

const AUTH_KINDS: readonly AuthKind[] = ['none', 'bearer', 'basic', 'header', 'query'];

export function secretKeyFor(projectId: string, kind: 'token' | 'user'): string {
  const safeId = projectId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return `project.${safeId}.${kind}`;
}

const SELECT_PROJECTS =
  'select id, name, base_url as baseUrl, auth_kind as authKind, auth_param as authParam, spec_sha as specSha, created_at as createdAt, updated_at as updatedAt from projects';

export async function listProjects(ctx: AddonContext): Promise<ProjectRow[]> {
  const rows = await ctx.db.all(`${SELECT_PROJECTS} order by name`);
  return rows.map(mapProject);
}

export async function getProject(ctx: AddonContext, id: string): Promise<ProjectRow | null> {
  const row = await ctx.db.get(`${SELECT_PROJECTS} where id = ?`, [id]);
  return row === null ? null : mapProject(row);
}

export async function createProject(
  ctx: AddonContext,
  data: { name: string; baseUrl: string; authKind: AuthKind; authParam: string | null },
): Promise<ProjectRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await ctx.db.run(
    'insert into projects (id, name, base_url, auth_kind, auth_param, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
    [id, data.name, data.baseUrl, data.authKind, data.authParam, now, now],
  );
  const created = await getProject(ctx, id);
  if (created === null) {
    throw new Error('project vanished after insert');
  }
  return created;
}

export async function updateProject(
  ctx: AddonContext,
  id: string,
  patch: { name?: string; baseUrl?: string; authKind?: AuthKind; authParam?: string | null },
): Promise<void> {
  const assignment = projectAssignment(patch);
  if (assignment === null) {
    return;
  }
  await ctx.db.run(
    `update projects set ${assignment.sets.join(', ')}, updated_at = ? where id = ?`,
    [...assignment.params, new Date().toISOString(), id],
  );
}

function projectAssignment(patch: {
  name?: string;
  baseUrl?: string;
  authKind?: AuthKind;
  authParam?: string | null;
}): { sets: string[]; params: (string | null)[] } | null {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.baseUrl !== undefined) {
    sets.push('base_url = ?');
    params.push(patch.baseUrl);
  }
  if (patch.authKind !== undefined) {
    sets.push('auth_kind = ?');
    params.push(patch.authKind);
  }
  if (patch.authParam !== undefined) {
    sets.push('auth_param = ?');
    params.push(patch.authParam);
  }
  return sets.length === 0 ? null : { sets, params };
}

export async function deleteProject(ctx: AddonContext, id: string): Promise<void> {
  await ctx.db.batch([
    { sql: 'delete from grants where project_id = ?', params: [id] },
    { sql: 'delete from operations where project_id = ?', params: [id] },
    { sql: 'delete from projects where id = ?', params: [id] },
  ]);
  await ctx.secrets.delete(secretKeyFor(id, 'token'));
  await ctx.secrets.delete(secretKeyFor(id, 'user'));
}

export async function projectNameTaken(ctx: AddonContext, name: string): Promise<boolean> {
  const rows = await ctx.db.all('select id from projects where name = ?', [name]);
  return rows.length > 0;
}

export function normalizeAuthKind(value: unknown): AuthKind | null {
  return typeof value === 'string' && (AUTH_KINDS as readonly string[]).includes(value)
    ? (value as AuthKind)
    : null;
}

function mapProject(row: DbRow): ProjectRow {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    baseUrl: String(row.baseUrl ?? ''),
    authKind: normalizeAuthKind(row.authKind) ?? 'none',
    authParam: typeof row.authParam === 'string' && row.authParam.length > 0 ? row.authParam : null,
    specSha: typeof row.specSha === 'string' ? row.specSha : null,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}
