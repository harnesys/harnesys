import { sandboxDenyText } from '../../application/tool-permission.ts';
import {
  MAP_INSTRUCTION_MAX_CHARS,
  MAP_ITEM_LIMIT,
  MAP_TOOL,
  WAIT_AWAIT_TIMEOUT_DEFAULT_MS,
  WAIT_DELAY_MS_MAX,
  WAIT_TOOL,
} from '../../constants.ts';
import { WaitInterrupt } from '../../domain/errors.ts';
import { parseSignalKey } from '../../domain/signal-key.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export { MAP_TOOL, WAIT_TOOL };

interface MapToolInput {
  items: unknown[];
  instruction?: string;
  maxTokensPerItem?: number;
}
function parseMapToolInput(input: unknown): MapToolInput {
  const rec = input as {
    items?: unknown;
    instruction?: unknown;
    maxTokensPerItem?: unknown;
  };
  if (!Array.isArray(rec.items)) {
    throw new Error('items must be an array');
  }
  if (rec.items.length > MAP_ITEM_LIMIT) {
    throw new Error(`items exceed limit ${MAP_ITEM_LIMIT}`);
  }
  if (rec.instruction !== undefined) {
    if (typeof rec.instruction !== 'string' || rec.instruction.trim().length === 0) {
      throw new Error('instruction must be a non-empty string');
    }
    if (rec.instruction.length > MAP_INSTRUCTION_MAX_CHARS) {
      throw new Error(`instruction exceeds limit ${MAP_INSTRUCTION_MAX_CHARS}`);
    }
  }
  if (rec.maxTokensPerItem !== undefined) {
    if (
      typeof rec.maxTokensPerItem !== 'number' ||
      !Number.isInteger(rec.maxTokensPerItem) ||
      rec.maxTokensPerItem < 1
    ) {
      throw new Error('maxTokensPerItem must be an integer >= 1');
    }
  }
  return {
    items: rec.items,
    ...(typeof rec.instruction === 'string' ? { instruction: rec.instruction } : {}),
    ...(typeof rec.maxTokensPerItem === 'number' ? { maxTokensPerItem: rec.maxTokensPerItem } : {}),
  };
}
export function mapTool(): ToolDefinition {
  return tool(MAP_TOOL, {
    description:
      'Queue a fan-out over items for the graph control:map node. items is a JSON array (max 32). Optional instruction is a per-item template with $item/$index; it overrides the node default. Optional maxTokensPerItem caps each worker text result. Each item is processed in the map body with $item/$index; results return as Map results in context. Prefer this for parallel same-graph work; use agents_spawn when you need another agent definition.',
    group: 'control',
    interactive: true,
    input: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to map (strings or objects). Max 32.',
          items: {
            description: 'Single item to process in the map body: string or object.',
          },
          maxItems: MAP_ITEM_LIMIT,
        },
        instruction: {
          type: 'string',
          description:
            'Per-item instruction template with $item/$index. Overrides the node default.',
          maxLength: MAP_INSTRUCTION_MAX_CHARS,
        },
        maxTokensPerItem: {
          type: 'integer',
          description: 'Per-item text budget in tokens (truncated at maxTokens * 4 chars).',
          minimum: 1,
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    execute(input, ctx: ToolContext) {
      if (ctx.sandbox) {
        return sandboxDenyText(MAP_TOOL, 'user input');
      }
      const parsed = parseMapToolInput(input);
      return {
        items: parsed.items,
        count: parsed.items.length,
        ...(parsed.instruction !== undefined ? { instruction: parsed.instruction } : {}),
        ...(parsed.maxTokensPerItem !== undefined
          ? { maxTokensPerItem: parsed.maxTokensPerItem }
          : {}),
      };
    },
  });
}
interface WaitToolInput {
  delayMs: number;
}
interface WaitSignalInput {
  signal: string;
  timeoutMs: number;
}
function parseWaitDelay(input: unknown): WaitToolInput {
  const rec = input as { delayMs?: unknown };
  const delayMs = rec.delayMs;
  if (
    typeof delayMs !== 'number' ||
    !Number.isFinite(delayMs) ||
    delayMs < 1 ||
    delayMs > WAIT_DELAY_MS_MAX
  ) {
    throw new Error(`invalid delayMs ${String(delayMs)}`);
  }
  return { delayMs };
}
function parseWaitSignal(input: unknown): WaitSignalInput {
  const rec = input as { signal?: unknown; timeoutMs?: unknown };
  const signal = rec.signal;
  if (typeof signal !== 'string' || signal.trim().length === 0) {
    throw new Error(`invalid signal ${String(signal)}`);
  }
  if (parseSignalKey(signal) === null) {
    throw new Error(`invalid signal ${signal}; expected '<kind>:<id>'`);
  }
  let timeoutMs = WAIT_AWAIT_TIMEOUT_DEFAULT_MS;
  if (rec.timeoutMs !== undefined) {
    if (
      typeof rec.timeoutMs !== 'number' ||
      !Number.isInteger(rec.timeoutMs) ||
      rec.timeoutMs < 1 ||
      rec.timeoutMs > WAIT_DELAY_MS_MAX
    ) {
      throw new Error(`invalid timeoutMs ${String(rec.timeoutMs)}`);
    }
    timeoutMs = rec.timeoutMs;
  }
  return { signal, timeoutMs };
}
function waitResumeText(resume: unknown): string {
  const payload = resume as { timedOut?: unknown; cause?: unknown };
  if (payload.timedOut === true) {
    return 'wait timed out';
  }
  return payload.cause === 'signal' ? 'signal settled' : 'wait elapsed';
}
export function wait(): ToolDefinition {
  return tool(WAIT_TOOL, {
    description:
      "Park this run until a wall-clock delay elapses (delayMs, 1 ms–7 d) or until a signal settles (signal, e.g. 'issue:<issueId>' resumes when the issue's dispatched execution is no longer active; free-form keys like 'deploy:done' work with the signals pack and signal_fire; optional timeoutMs bounds a signal wait, default 30 min, resume payload timedOut: true on expiry). Does not replace ask_user.",
    group: 'control',
    interactive: true,
    input: {
      type: 'object',
      properties: {
        delayMs: {
          type: 'integer',
          minimum: 1,
          maximum: WAIT_DELAY_MS_MAX,
          description:
            'Milliseconds to sleep before the run continues. Mutually exclusive with signal.',
        },
        signal: {
          type: 'string',
          minLength: 1,
          description:
            "Wake key to park on, format '<kind>:<id>' (e.g. 'issue:<issueId>'). Mutually exclusive with delayMs.",
        },
        timeoutMs: {
          type: 'integer',
          minimum: 1,
          maximum: WAIT_DELAY_MS_MAX,
          description: 'Signal wait fallback in ms. Default 30 min.',
        },
      },
      additionalProperties: false,
    },
    execute(input, ctx: ToolContext) {
      if (ctx.resume !== undefined && ctx.resume !== null) {
        return waitResumeText(ctx.resume);
      }
      if (ctx.sandbox) {
        return sandboxDenyText(WAIT_TOOL, 'user input');
      }
      const rec = input as {
        delayMs?: unknown;
        signal?: unknown;
      };
      const hasDelay = typeof rec.delayMs === 'number';
      const hasSignal = typeof rec.signal === 'string' && rec.signal.trim().length > 0;
      if (hasDelay === hasSignal) {
        throw new Error('provide exactly one of delayMs or signal');
      }
      if (hasSignal) {
        const { signal, timeoutMs } = parseWaitSignal(input);
        throw new WaitInterrupt({
          wakeKey: signal,
          fireAt: Date.now() + timeoutMs,
          onTimeout: 'continue',
        });
      }
      const { delayMs } = parseWaitDelay(input);
      throw new WaitInterrupt({ fireAt: Date.now() + delayMs });
    },
  });
}
