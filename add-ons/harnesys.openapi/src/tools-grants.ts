import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { requireAgent } from './call.ts';
import {
  appendGrantAudit,
  grantOperations,
  hasGrant,
  listGrants,
  revokeGrantFor,
} from './store-grants.ts';
import {
  optionalLimit,
  optionalText,
  requiredText,
  requireOperation,
  requireProject,
} from './tools.ts';

const GRANTS_LIMIT_DEFAULT = 100;
const GRANTS_LIMIT_MAX = 500;

interface ResolvedAgent {
  id: string;
  name: string;
}

export const grantsList: ToolHandler = async (input, ctx) => {
  requireAgent(ctx);
  const project = optionalText(input, 'project');
  const agentKey = optionalText(input, 'agent');
  const limit = optionalLimit(input.limit, GRANTS_LIMIT_DEFAULT, GRANTS_LIMIT_MAX);
  const agent = agentKey === undefined ? undefined : await requireAgentByIdOrName(ctx, agentKey);
  const rows = await listGrants(ctx, {
    ...(project === undefined ? {} : { projectKey: project }),
    ...(agent === undefined ? {} : { agentId: agent.id }),
  });
  const names = await agentNames(ctx);
  return {
    total: rows.length,
    grants: rows.slice(0, limit).map((row) => ({
      agent: row.agentId,
      agentName: names.get(row.agentId) ?? row.agentId,
      project: row.project,
      operation: row.operationId,
      method: row.method,
      path: row.pathTemplate,
      summary: row.summary,
      grantedAt: row.grantedAt,
    })),
  };
};

export const grantsGrant: ToolHandler = async (input, ctx) => {
  const actorId = requireAgent(ctx);
  const target = await requireAgentByIdOrName(ctx, requiredText(input, 'agent'));
  const project = await requireProject(ctx, input);
  const operation = await requireOperation(ctx, project, input);
  const already = await hasGrant(ctx, target.id, project.id, operation.operationId);
  if (!already) {
    await grantOperations(ctx, target.id, project.id, [operation.operationId]);
  }
  await appendGrantAudit(ctx, {
    actorAgentId: actorId,
    action: 'grant',
    agentId: target.id,
    projectId: project.id,
    operationId: operation.operationId,
    result: already ? 'already_granted' : 'granted',
  });
  await ctx.log.info('grant changed', {
    actor: actorId,
    action: 'grant',
    agent: target.id,
    project: project.name,
    operation: operation.operationId,
    result: already ? 'already_granted' : 'granted',
  });
  return {
    agent: { id: target.id, name: target.name },
    project: project.name,
    operation: operation.operationId,
    already,
  };
};

export const grantsRevoke: ToolHandler = async (input, ctx) => {
  const actorId = requireAgent(ctx);
  const target = await requireAgentByIdOrName(ctx, requiredText(input, 'agent'));
  const project = await requireProject(ctx, input);
  const operation = await requireOperation(ctx, project, input);
  const existed = await hasGrant(ctx, target.id, project.id, operation.operationId);
  if (existed) {
    await revokeGrantFor(ctx, target.id, project.id, operation.operationId);
  }
  await appendGrantAudit(ctx, {
    actorAgentId: actorId,
    action: 'revoke',
    agentId: target.id,
    projectId: project.id,
    operationId: operation.operationId,
    result: existed ? 'revoked' : 'not_granted',
  });
  await ctx.log.info('grant changed', {
    actor: actorId,
    action: 'revoke',
    agent: target.id,
    project: project.name,
    operation: operation.operationId,
    result: existed ? 'revoked' : 'not_granted',
  });
  return {
    agent: { id: target.id, name: target.name },
    project: project.name,
    operation: operation.operationId,
    revoked: existed,
  };
};

async function requireAgentByIdOrName(ctx: AddonContext, key: string): Promise<ResolvedAgent> {
  const agents = await ctx.agents.list();
  const match =
    agents.find((agent) => agent.id === key) ?? agents.find((agent) => agent.name === key);
  if (match === undefined) {
    throw new AddonError('not_found', {
      detail: `agent '${key}' does not exist; check the agent id or exact name`,
    });
  }
  return { id: match.id, name: match.name };
}

async function agentNames(ctx: AddonContext): Promise<Map<string, string>> {
  const agents = await ctx.agents.list();
  return new Map(agents.map((agent) => [agent.id, agent.name]));
}
