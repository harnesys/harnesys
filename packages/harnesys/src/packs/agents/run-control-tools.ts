import {
  AGENTS_SEND_TOOL,
  AGENTS_STATUS_TOOL,
  AGENTS_STOP_TOOL,
  AGENTS_WAIT_TOOL,
} from '../../constants.ts';
import type { BackgroundToolStatus, RunToolControl, ToolContext } from '../../ports/tools.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

const RUN_CONTROL_MISSING = 'run control is unavailable in this context';
const RUN_ID_MISSING = 'run context is unavailable';

function runControlOf(ctx: ToolContext): RunToolControl | null {
  return ctx.runControl ?? null;
}

function threadIdOf(ctx: ToolContext): string | null {
  return typeof ctx.threadId === 'string' && ctx.threadId ? ctx.threadId : null;
}

function requireRunControl(
  ctx: ToolContext,
): { control: RunToolControl; threadId: string } | { error: string } {
  const control = runControlOf(ctx);
  if (!control) {
    return { error: RUN_CONTROL_MISSING };
  }
  const threadId = threadIdOf(ctx);
  if (!threadId) {
    return { error: RUN_ID_MISSING };
  }
  return { control, threadId };
}

function statusPayload(agents: BackgroundToolStatus[]): Record<string, unknown> {
  const running = agents.filter((agent) => agent.status === 'running');
  return {
    agents,
    pending: running.length,
    allSettled: running.length === 0,
  };
}

const BOARD_ACTIVITY_CHARS = 100;

function idleSecOf(agent: BackgroundToolStatus): number | undefined {
  return agent.idleMs === undefined ? undefined : Math.round(agent.idleMs / 1000);
}

function boardRowOf(agent: BackgroundToolStatus): Record<string, unknown> {
  const idleSec = idleSecOf(agent);
  const last =
    agent.status === 'running' && agent.tail ? agent.tail.slice(-BOARD_ACTIVITY_CHARS) : undefined;
  const writes =
    agent.status === 'failed' && agent.effects !== undefined
      ? agent.effects.entries.length + agent.effects.omitted
      : undefined;
  return {
    spawnId: agent.spawnId,
    name: agent.agentName ?? agent.agentId,
    status: agent.status,
    ...(idleSec !== undefined ? { idleSec } : {}),
    ...(last !== undefined ? { last } : {}),
    ...(agent.error !== undefined ? { errorCode: agent.error.code } : {}),
    ...(writes !== undefined ? { writes } : {}),
  };
}

function boardCounts(agents: BackgroundToolStatus[]): Record<string, number> {
  const counts: Record<string, number> = { running: 0, done: 0, failed: 0 };
  for (const agent of agents) {
    const value = counts[agent.status] ?? 0;
    counts[agent.status] = value + 1;
  }
  return counts;
}

function boardPayload(agents: BackgroundToolStatus[]): Record<string, unknown> {
  const counts = boardCounts(agents);
  return {
    counts,
    allSettled: counts.running === 0,
    agents: agents.map(boardRowOf),
  };
}

function childDetailOf(agent: BackgroundToolStatus, withOutput: boolean): Record<string, unknown> {
  const idleSec = idleSecOf(agent);
  return {
    spawnId: agent.spawnId,
    name: agent.agentName ?? agent.agentId,
    agentId: agent.agentId,
    status: agent.status,
    ...(idleSec !== undefined ? { idleSec } : {}),
    ...(agent.tail !== undefined ? { tail: agent.tail } : {}),
    ...(agent.error !== undefined ? { error: agent.error } : {}),
    ...(agent.effects !== undefined ? { effects: agent.effects } : {}),
    ...(agent.caps !== undefined ? { caps: agent.caps } : {}),
    ...(agent.toolUse !== undefined ? { toolUse: agent.toolUse } : {}),
    ...(withOutput && agent.output !== undefined ? { output: agent.output } : {}),
  };
}

function agentsWaitTool(): ToolDefinition {
  return tool(AGENTS_WAIT_TOOL, {
    group: 'agents',
    sideEffect: 'read',
    description:
      'Wait for your background subagents (started via agents_spawn with background: true in this thread) to finish, then collect their statuses and outputs. Optional timeoutMs caps the wait (default: wait until all settle); on timeout, running agents are returned with status "running" — call again or check agents_status. Read-only on the agents themselves.',
    input: {
      type: 'object',
      properties: {
        timeoutMs: {
          type: 'number',
          description:
            'Optional wait cap in milliseconds; omit to wait until every background agent settles.',
        },
      },
      additionalProperties: false,
    },
    execute: async (raw, ctx) => {
      const guard = requireRunControl(ctx);
      if ('error' in guard) {
        return { error: guard.error };
      }
      const rec = (raw ?? {}) as { timeoutMs?: unknown };
      const timeoutMs =
        typeof rec.timeoutMs === 'number' && rec.timeoutMs > 0 ? rec.timeoutMs : undefined;
      const agents = await guard.control.waitBackground(guard.threadId, timeoutMs);
      return statusPayload(agents);
    },
  });
}

async function unknownSpawnError(
  control: RunToolControl,
  threadId: string,
  spawnId: string,
): Promise<Record<string, unknown>> {
  const known = await control.status(threadId);
  const list = known
    .map((a) => `${a.spawnId} (${a.agentName ?? a.agentId}): ${a.status}`)
    .join(', ');
  return {
    error: list
      ? `no background agent with spawnId "${spawnId}" in this thread; known: ${list}`
      : 'no background agents in this thread yet',
  };
}

function agentsStatusTool(): ToolDefinition {
  return tool(AGENTS_STATUS_TOOL, {
    group: 'agents',
    sideEffect: 'read',
    description:
      'Board of background subagents started in this thread. No spawnId: cheap dashboard — counts {running, done, failed} plus one row per child {spawnId, name, status, idleSec and a last-activity snippet for running, errorCode for failed}; never returns outputs or full tails, safe to poll. With spawnId: one child in detail — status, full activity tail, error, write-effects journal; add output: true only for its final output (agents_wait collects all outputs after settling; each settled child also auto-reports into this thread). Unknown spawnId replies with the list of known ids. Use idleSec/last to spot a stalled child (agents_send to nudge, agents_stop to kill, agents_spawn to rerun a dead one with a summary brief).',
    input: {
      type: 'object',
      properties: {
        spawnId: {
          type: 'string',
          description:
            'Optional spawn id to drill into one child (from agents_spawn or the board); omit for the board of all children.',
        },
        output: {
          type: 'boolean',
          description:
            "With spawnId only: include this child's full final output. The board never returns outputs.",
        },
      },
      additionalProperties: false,
    },
    execute: async (raw, ctx) => {
      const guard = requireRunControl(ctx);
      if ('error' in guard) {
        return { error: guard.error };
      }
      const rec = (raw ?? {}) as { spawnId?: unknown; output?: unknown };
      const spawnId = typeof rec.spawnId === 'string' && rec.spawnId ? rec.spawnId : undefined;
      if (spawnId === undefined && rec.output === true) {
        return { error: 'output requires spawnId; the board never returns outputs' };
      }
      const agents = await guard.control.status(guard.threadId, spawnId);
      if (spawnId === undefined) {
        return boardPayload(agents);
      }
      const agent = agents[0];
      if (agent !== undefined) {
        return childDetailOf(agent, rec.output === true);
      }
      return unknownSpawnError(guard.control, guard.threadId, spawnId);
    },
  });
}

function agentsSendTool(): ToolDefinition {
  return tool(AGENTS_SEND_TOOL, {
    group: 'agents',
    sideEffect: 'write',
    description:
      "Send a steering message to a running background subagent. It is applied at the child's next safe point (before its next model step) — it never interrupts a tool call or model call in progress. Use agents_status first: a done/failed agent cannot receive messages (rerun it via agents_spawn instead).",
    input: {
      type: 'object',
      properties: {
        spawnId: { type: 'string', description: 'Spawn id of the running background agent.' },
        text: { type: 'string', description: 'Steering text for the child.' },
      },
      required: ['spawnId', 'text'],
      additionalProperties: false,
    },
    execute: async (raw, ctx) => {
      const guard = requireRunControl(ctx);
      if ('error' in guard) {
        return { error: guard.error };
      }
      const rec = (raw ?? {}) as { spawnId?: unknown; text?: unknown };
      if (typeof rec.spawnId !== 'string' || !rec.spawnId) {
        return { error: 'spawnId must be a non-empty string' };
      }
      if (typeof rec.text !== 'string' || !rec.text.trim()) {
        return { error: 'text must be a non-empty string' };
      }
      if (!ctx.threadId) {
        return { error: RUN_ID_MISSING };
      }
      return guard.control.send(ctx.threadId, rec.spawnId, rec.text);
    },
  });
}

function agentsStopTool(): ToolDefinition {
  return tool(AGENTS_STOP_TOOL, {
    group: 'agents',
    sideEffect: 'destructive',
    description:
      'Stop a running background subagent (user-level Stop and agents_wait cannot revive it afterwards). Returns { ok } — the child aborts at its next engine checkpoint and closes as failed. Use agents_status with its spawnId afterwards to read the tail and write-effects journal, then agents_spawn to rerun the remaining work with a summary brief.',
    input: {
      type: 'object',
      properties: {
        spawnId: { type: 'string', description: 'Spawn id of the running background agent.' },
      },
      required: ['spawnId'],
      additionalProperties: false,
    },
    execute: async (raw, ctx) => {
      const guard = requireRunControl(ctx);
      if ('error' in guard) {
        return { error: guard.error };
      }
      const rec = (raw ?? {}) as { spawnId?: unknown };
      if (typeof rec.spawnId !== 'string' || !rec.spawnId) {
        return { error: 'spawnId must be a non-empty string' };
      }
      return guard.control.stop(guard.threadId, rec.spawnId);
    },
  });
}

export function createAgentsRunControlTools(): ToolDefinition[] {
  return [agentsWaitTool(), agentsStatusTool(), agentsSendTool(), agentsStopTool()];
}
