import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { getProject } from './store.ts';
import {
  grantedOperationIds,
  grantOperations,
  hasGrant,
  revokeAgentGrants,
  revokeGrantFor,
} from './store-grants.ts';
import { getOperation, listOperations } from './store-operations.ts';
import { ValidationError } from './validate.ts';

export const agents: RouteHandler = async (_call, ctx) => {
  const agents = await ctx.agents.list();
  return {
    status: 200,
    body: { rows: agents.map((agent) => ({ id: agent.id, name: agent.name })) },
  };
};

export const operations: RouteHandler = async (call, ctx) => {
  const projectId = call.request.query.projectId;
  const agentId = call.request.query.agentId;
  const rows = await listOperations(
    ctx,
    projectId !== undefined && projectId.length > 0 ? projectId : undefined,
  );
  const granted =
    agentId !== undefined && agentId.length > 0
      ? await grantedOperationIds(ctx, agentId)
      : new Set<string>();
  const projects = await projectNames(ctx);
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        project: projects.get(row.projectId) ?? row.projectId,
        operation: row.operationId,
        method: row.method,
        path: row.pathTemplate,
        summary: row.summary,
        granted: granted.has(row.operationId),
        value: row.operationId,
        label: `${row.method} ${row.pathTemplate}`,
      })),
    },
  };
};

export const grantsToggle: RouteHandler = async (call, ctx) => {
  const agentId = requireQuery(call.request.query, 'agentId');
  const projectId = requireQuery(call.request.query, 'projectId');
  const operationId = requireQuery(call.request.query, 'operation');
  const project = await getProject(ctx, projectId);
  if (project === null) {
    return { status: 404, body: { error: `project '${projectId}' does not exist` } };
  }
  const operation = await getOperation(ctx, projectId, operationId);
  if (operation === null) {
    return {
      status: 404,
      body: { error: `operation '${operationId}' does not exist in project '${projectId}'` },
    };
  }
  if (await hasGrant(ctx, agentId, projectId, operationId)) {
    await revokeGrantFor(ctx, agentId, projectId, operationId);
    return { status: 200, body: { toast: 'Access revoked', refresh: true } };
  }
  await grantOperations(ctx, agentId, projectId, [operationId]);
  return { status: 200, body: { toast: 'Access granted', refresh: true } };
};

export const grantsSetAll: RouteHandler = async (call, ctx) => {
  const body = objectOf(call.request.body, 'request body must be a JSON object');
  const enabled = body.enabled === true;
  const agentId = requireQuery(call.request.query, 'agentId');
  const projectIdRaw = call.request.query.projectId;
  const scope = projectIdRaw !== undefined && projectIdRaw.length > 0 ? projectIdRaw : undefined;
  if (enabled) {
    const ops = await listOperations(ctx, scope);
    const granted = await grantedOperationIds(ctx, agentId);
    const byProject = new Map<string, string[]>();
    for (const op of ops) {
      if (granted.has(op.operationId)) {
        continue;
      }
      const ids = byProject.get(op.projectId) ?? [];
      ids.push(op.operationId);
      byProject.set(op.projectId, ids);
    }
    let added = 0;
    for (const [projectId, ids] of byProject) {
      added += await grantOperations(ctx, agentId, projectId, ids);
    }
    return { status: 200, body: { toast: `Granted ${added} operation(s)`, refresh: true } };
  }
  const removed = await revokeAgentGrants(ctx, agentId, scope);
  return { status: 200, body: { toast: `Revoked ${removed} grant(s)`, refresh: true } };
};

function objectOf(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value as Record<string, unknown>;
}

async function projectNames(ctx: AddonContext): Promise<Map<string, string>> {
  const rows = await ctx.db.all('select id, name from projects');
  return new Map(rows.map((row) => [String(row.id), String(row.name)]));
}

function requireQuery(query: Record<string, string | undefined>, key: string): string {
  const value = query[key];
  if (value === undefined || value.length === 0) {
    throw new ValidationError(`query parameter '${key}' is required`);
  }
  return value;
}
