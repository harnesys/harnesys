import { formatAgentTargets, resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import type { AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { AGENT_ID_INPUT, agentUpdateTool } from './create-agent-update-tool.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

function notYourDelegate(
  name: string,
  verb: 'removed',
): {
  error: string;
} {
  return {
    error: `"${name}" is not your delegate; only delegates created by you can be ${verb} here (top-level agents are managed in the project UI).`,
  };
}

type OwnedDelegate =
  | {
      row: AgentCatalogSummary;
    }
  | {
      error: string;
    };

function resolveOwnedDelegate(
  query: string,
  rows: AgentCatalogSummary[],
  currentAgentId: string,
  verb: 'removed',
): OwnedDelegate {
  const roster = rows.map((row) => ({ id: row.id, name: row.name }));
  const hit = resolveAgentTarget(query, roster);
  if ('error' in hit) {
    if (hit.error.startsWith('ambiguous')) {
      return hit;
    }
    const mine = rows
      .filter((row) => row.parentId === currentAgentId)
      .map((row) => ({ id: row.id, name: row.name }));
    const available = formatAgentTargets(mine) || '(none)';
    return {
      error:
        `unknown target "${query}": no such agent in your scope — it may be a typo, already deleted, or owned by another agent ` +
        `(top-level agents are managed in the project UI). Your delegates: ${available}`,
    };
  }
  const row = rows.find((r) => r.id === hit.id);
  if (!row) {
    return { error: `unknown target "${query}"` };
  }
  if (row.parentId !== currentAgentId) {
    return notYourDelegate(row.name, verb);
  }
  return { row };
}

async function applyDelete(
  deps: CreateAgentsToolsParams,
  raw: unknown,
  ctx: {
    agentId?: string;
  },
): Promise<
  | {
      removed: string;
      name: string;
    }
  | {
      error: string;
    }
> {
  const removeFn = deps.agents.remove;
  if (!removeFn) {
    return { error: 'agents_delete is not available in this host' };
  }
  const input = (raw ?? {}) as {
    agentId?: unknown;
  };
  if (typeof input.agentId !== 'string' || !input.agentId) {
    return { error: 'agentId must be a non-empty string' };
  }
  const scope = scopeFor(deps, ctx);
  const rows = await deps.agents.list(scope);
  const target = resolveOwnedDelegate(input.agentId, rows, scope.agentId, 'removed');
  if ('error' in target) {
    return target;
  }
  const res = await removeFn.call(deps.agents, scope, target.row.id);
  if ('error' in res) {
    return res;
  }
  return { removed: target.row.id, name: target.row.name };
}

export function createAgentLifecycleTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  const lifecycle: ToolDefinition[] = [];
  if (deps.agents.patch) {
    lifecycle.push(agentUpdateTool(deps));
  }
  if (deps.agents.remove) {
    lifecycle.push(
      tool('agents_delete', {
        group: 'agents',
        operations: ['agents'],
        sideEffect: 'write',
        description:
          'Remove your own delegate that is not running anywhere; project UI manages top-level agents. ' +
          'agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets and agents you do not own fail here with an error. ' +
          'Returns { removed, name }.',
        input: {
          type: 'object',
          properties: { ...AGENT_ID_INPUT },
          required: ['agentId'],
        },
        execute: (raw, ctx) => runGuard(() => applyDelete(deps, raw, ctx)),
      }),
    );
  }
  return lifecycle;
}
