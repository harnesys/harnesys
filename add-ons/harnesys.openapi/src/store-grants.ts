import type { AddonContext } from '@harnesys/sdk';

const BATCH_LIMIT = 100;

export async function grantedOperationIds(
  ctx: AddonContext,
  agentId: string,
): Promise<Set<string>> {
  const rows = await ctx.db.all(
    'select operation_id as operationId from grants where agent_id = ?',
    [agentId],
  );
  return new Set(rows.map((row) => String(row.operationId)));
}

export interface GrantedOperation {
  projectName: string;
  projectId: string;
  operationId: string;
  method: string;
  pathTemplate: string;
  summary: string;
}

export async function listGrantedOperations(
  ctx: AddonContext,
  agentId: string,
): Promise<GrantedOperation[]> {
  const rows = await ctx.db.all(
    `select p.name as projectName, p.id as projectId, o.operation_id as operationId, o.method, o.path_template as pathTemplate, o.summary
     from grants g
     join operations o on o.project_id = g.project_id and o.operation_id = g.operation_id
     join projects p on p.id = g.project_id
     where g.agent_id = ?
     order by p.name, o.path_template, o.method`,
    [agentId],
  );
  return rows.map((row) => ({
    projectName: String(row.projectName ?? ''),
    projectId: String(row.projectId ?? ''),
    operationId: String(row.operationId ?? ''),
    method: String(row.method ?? 'GET'),
    pathTemplate: String(row.pathTemplate ?? ''),
    summary: String(row.summary ?? ''),
  }));
}

export async function hasGrant(
  ctx: AddonContext,
  agentId: string,
  projectId: string,
  operationId: string,
): Promise<boolean> {
  const row = await ctx.db.get(
    'select id from grants where agent_id = ? and project_id = ? and operation_id = ?',
    [agentId, projectId, operationId],
  );
  return row !== null;
}

export async function grantOperations(
  ctx: AddonContext,
  agentId: string,
  projectId: string,
  operationIds: string[],
): Promise<number> {
  const now = new Date().toISOString();
  const statements = operationIds.map((operationId) => ({
    sql: 'insert or ignore into grants (agent_id, project_id, operation_id, created_at) values (?, ?, ?, ?)',
    params: [agentId, projectId, operationId, now],
  }));
  let granted = 0;
  for (let index = 0; index < statements.length; index += BATCH_LIMIT) {
    const results = await ctx.db.batch(statements.slice(index, index + BATCH_LIMIT));
    granted += results.reduce((sum, result) => sum + (result.changes > 0 ? 1 : 0), 0);
  }
  return granted;
}

export async function revokeGrantFor(
  ctx: AddonContext,
  agentId: string,
  projectId: string,
  operationId: string,
): Promise<void> {
  await ctx.db.run(
    'delete from grants where agent_id = ? and project_id = ? and operation_id = ?',
    [agentId, projectId, operationId],
  );
}

export async function revokeAgentGrants(
  ctx: AddonContext,
  agentId: string,
  projectId?: string,
): Promise<number> {
  const result =
    projectId === undefined
      ? await ctx.db.run('delete from grants where agent_id = ?', [agentId])
      : await ctx.db.run('delete from grants where agent_id = ? and project_id = ?', [
          agentId,
          projectId,
        ]);
  return result.changes;
}

export interface GrantRow {
  agentId: string;
  project: string;
  operationId: string;
  method: string;
  pathTemplate: string;
  summary: string;
  grantedAt: string;
}

export async function listGrants(
  ctx: AddonContext,
  filter: { projectKey?: string; agentId?: string },
): Promise<GrantRow[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.projectKey !== undefined) {
    conditions.push('(p.id = ? or p.name = ?)');
    params.push(filter.projectKey, filter.projectKey);
  }
  if (filter.agentId !== undefined) {
    conditions.push('g.agent_id = ?');
    params.push(filter.agentId);
  }
  const where = conditions.length === 0 ? '' : ` where ${conditions.join(' and ')}`;
  const rows = await ctx.db.all(
    `select g.agent_id as agentId, p.name as project, o.operation_id as operationId,
            o.method, o.path_template as pathTemplate, o.summary, g.created_at as grantedAt
     from grants g
     join operations o on o.project_id = g.project_id and o.operation_id = g.operation_id
     join projects p on p.id = g.project_id${where}
     order by p.name, o.path_template, o.method, g.agent_id`,
    params,
  );
  return rows.map((row) => ({
    agentId: String(row.agentId ?? ''),
    project: String(row.project ?? ''),
    operationId: String(row.operationId ?? ''),
    method: String(row.method ?? 'GET'),
    pathTemplate: String(row.pathTemplate ?? ''),
    summary: String(row.summary ?? ''),
    grantedAt: String(row.grantedAt ?? ''),
  }));
}

export interface GrantAuditEntry {
  actorAgentId: string;
  action: 'grant' | 'revoke';
  agentId: string;
  projectId: string;
  operationId: string;
  result: string;
}

export async function appendGrantAudit(ctx: AddonContext, entry: GrantAuditEntry): Promise<void> {
  await ctx.db.run(
    `insert into grant_audit (at, actor_agent_id, action, agent_id, project_id, operation_id, result)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      new Date().toISOString(),
      entry.actorAgentId,
      entry.action,
      entry.agentId,
      entry.projectId,
      entry.operationId,
      entry.result,
    ],
  );
}
