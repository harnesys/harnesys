import { resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import { parseSpawnBudget, parseSpawnPermissions } from '../../application/graph-spawn.ts';
import { SPAWN_ITEM_LIMIT } from '../../constants.ts';
import type { AgentRosterEntry } from '../../ports/create-runtime.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

const INPUT_SHAPE_ERROR = 'input must be a string or { messages: [{ role, content }] }';
function messageShapeError(message: unknown, index: number): string | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return `input.messages[${index}] must be an object`;
  }
  const msg = message as { role?: unknown; content?: unknown };
  if (typeof msg.role !== 'string' || !msg.role) {
    return `input.messages[${index}].role must be a non-empty string`;
  }
  if (typeof msg.content !== 'string' || !msg.content.trim()) {
    return `input.messages[${index}].content must be a non-empty string`;
  }
  return null;
}
function messagesShapeError(messages: unknown[]): string | null {
  for (const [index, message] of messages.entries()) {
    const error = messageShapeError(message, index);
    if (error !== null) {
      return error;
    }
  }
  return null;
}
function childInputShapeError(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? 'input must not be empty' : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return INPUT_SHAPE_ERROR;
  }
  const rec = value as {
    messages?: unknown;
    text?: unknown;
  };
  if (typeof rec.text === 'string') {
    return rec.text.trim() === '' ? 'input.text must not be empty' : null;
  }
  if (!Array.isArray(rec.messages) || rec.messages.length === 0) {
    return INPUT_SHAPE_ERROR;
  }
  return messagesShapeError(rec.messages);
}
function spawnCallsShapeError(calls: unknown[]): string | null {
  for (let idx = 0; idx < calls.length; idx += 1) {
    const item = calls[idx];
    const rec =
      item && typeof item === 'object'
        ? (item as {
            agentId?: unknown;
            budget?: unknown;
            input?: unknown;
            permissions?: unknown;
          })
        : null;
    const agentId = rec?.agentId;
    if (typeof agentId !== 'string' || !agentId) {
      return `calls[${idx}].agentId must be a non-empty string`;
    }
    const inputError = childInputShapeError(rec?.input);
    if (inputError !== null) {
      return `calls[${idx}].${inputError}`;
    }
    const parsed = parseSpawnBudget(rec?.budget);
    if (parsed.error !== undefined) {
      return `calls[${idx}].${parsed.error}`;
    }
    const parsedPermissions = parseSpawnPermissions(rec?.permissions);
    if (parsedPermissions.error !== undefined) {
      return `calls[${idx}].${parsedPermissions.error}`;
    }
  }
  return null;
}
function spawnCallsTargetError(calls: unknown[], roster: AgentRosterEntry[]): string | null {
  for (const item of calls) {
    const agentId = (
      item as {
        agentId: string;
      }
    ).agentId;
    const hit = resolveAgentTarget(agentId, roster);
    if ('error' in hit) {
      return hit.error;
    }
  }
  return null;
}
function spawnCallsCountError(count: number): string | null {
  if (count === 0) {
    return 'no spawn calls provided';
  }
  if (count > SPAWN_ITEM_LIMIT) {
    return `calls exceed limit ${SPAWN_ITEM_LIMIT}`;
  }
  return null;
}
export function spawnAgentTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('agents_spawn', {
    group: 'agents',
    sideEffect: 'write',
    description:
      'Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input, budget?, permissions? }] — budget {maxSteps?, maxTokens?, deadlineMs?} caps this child only; omit to inherit your own budget. input is required: { messages: [{ role: "user", content: "<task>" }] } or a plain string (one user message). Children cannot ask questions back — `ask`-gated calls, approvals and `ask_user` are denied in child context (pre-approve a delegate by passing permissions per call, e.g. {"fs.write":"allow"}; a grant may lift your own ask gate but never a gate you hold as deny — otherwise provide everything upfront). On budget exhaustion a child never fails: it closes with a report and the result carries budget { kind, limit, used, closingStep: true } (used may exceed limit by that closing report step). agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn. Children run with bounded concurrency, and a spawn timeout aborts the rest and returns a partial result: aborted children come back as errors, so read every entry.',
    input: {
      type: 'object',
      properties: {
        calls: {
          type: 'array',
          description: `Child runs to start. Parent waits for all. Max ${SPAWN_ITEM_LIMIT} calls per spawn.`,
          maxItems: SPAWN_ITEM_LIMIT,
          items: {
            type: 'object',
            properties: {
              agentId: {
                type: 'string',
                description: 'Target agent id from agents_list or agents_create',
              },
              input: {
                description:
                  'Child run input (required): { "messages": [{ "role": "user", "content": "<task>" }] }, or a plain string — the engine wraps it into one user message. Other shapes are rejected.',
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    properties: {
                      messages: {
                        type: 'array',
                        description: 'Messages of the child run; the user message is the task.',
                        items: {
                          type: 'object',
                          properties: {
                            role: { type: 'string', enum: ['user'] },
                            content: { type: 'string' },
                          },
                          required: ['role', 'content'],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ['messages'],
                    additionalProperties: false,
                  },
                ],
              },
              budget: {
                type: 'object',
                description:
                  'Optional child quota (maxSteps, maxTokens, deadlineMs >= 0), replaces the child budget entirely; defaults to inheriting yours. policy is ignored: a sandboxed child never asks and always closes with a report.',
                properties: {
                  maxSteps: {
                    type: 'number',
                    description: 'Node executions allowed for the child',
                  },
                  maxTokens: { type: 'number' },
                  deadlineMs: { type: 'number' },
                  policy: {
                    type: 'string',
                    enum: ['ask', 'error'],
                    description:
                      'Accepted and ignored: a sandboxed child never asks and always closes with a report.',
                  },
                },
                additionalProperties: false,
              },
              permissions: {
                type: 'object',
                description:
                  'Optional permission grants for this child run: op -> allow|ask|deny (fs.read, fs.write, process, network, mcp). A grant may lift your own ask gate for the child, but never a gate you have deny. In the sandboxed child ask behaves as deny, so grant allow for anything the child must actually do.',
              },
            },
            required: ['agentId'],
          },
        },
      },
      required: ['calls'],
    },
    execute: async (raw, execCtx) =>
      runGuard(async () => {
        const rec = (raw ?? {}) as {
          calls?: unknown;
        };
        if (!Array.isArray(rec.calls)) {
          return { error: 'calls must be an array' };
        }
        const countError = spawnCallsCountError(rec.calls.length);
        if (countError !== null) {
          return { error: countError };
        }
        const shapeError = spawnCallsShapeError(rec.calls);
        if (shapeError) {
          return { error: shapeError };
        }
        const scope = scopeFor(deps, execCtx);
        const rows = await deps.agents.list(scope);
        const targetError = spawnCallsTargetError(
          rec.calls,
          rows.map((row) => ({ id: row.id, name: row.name })),
        );
        if (targetError) {
          return { error: targetError };
        }
        return { calls: rec.calls };
      }),
  });
}
