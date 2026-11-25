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

function agentsStatusTool(): ToolDefinition {
  return tool(AGENTS_STATUS_TOOL, {
    group: 'agents',
    sideEffect: 'read',
    description:
      'Inspect background subagents started in this thread: status (running/done/failed), idle time for running ones, a tail of their recent activity, and the final output for finished ones. Pass spawnId for one agent or omit for all. Use it to recover context when a background agent failed or stalled (pair with agents_send to nudge a live one, agents_stop to kill one, agents_spawn to rerun a dead one with a summary brief).',
    input: {
      type: 'object',
      properties: {
        spawnId: {
          type: 'string',
          description: 'Optional spawn id of one background agent; omit to list all.',
        },
      },
      additionalProperties: false,
    },
    execute: async (raw, ctx) => {
      const guard = requireRunControl(ctx);
      if ('error' in guard) {
        return { error: guard.error };
      }
      const rec = (raw ?? {}) as { spawnId?: unknown };
      const spawnId = typeof rec.spawnId === 'string' && rec.spawnId ? rec.spawnId : undefined;
      const agents = await guard.control.status(guard.threadId, spawnId);
      return statusPayload(agents);
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
      'Stop a running background subagent (user-level Stop and agents_wait cannot revive it afterwards). Returns { ok } — the child aborts at its next engine checkpoint and closes as failed. Use agents_status afterwards to read what it accomplished before the stop, then agents_spawn to rerun the remaining work with a summary brief.',
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
