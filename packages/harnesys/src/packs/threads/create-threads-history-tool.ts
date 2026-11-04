import type { RunEventStore } from '../../ports/run-event-store.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { readThreadHistory } from './thread-history.ts';

export const THREADS_HISTORY_TOOL = 'threads_history';

export interface ThreadsHistoryToolDeps {
  threadId: string;
  events: RunEventStore;
}

const MAX_LIMIT = 50;

export function createThreadsHistoryTool(deps: ThreadsHistoryToolDeps): ToolDefinition {
  return tool(THREADS_HISTORY_TOOL, {
    description:
      'Read older conversational messages of this thread before the current window. People messages and final answers are returned in thread order; pass beforeSeq to page further back. Use threads_search to find a specific phrase.',
    group: 'thread',
    operations: ['read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        beforeSeq: {
          type: 'number',
          description: 'Return messages older than this thread sequence. Defaults to the end.',
        },
        limit: { type: 'number', description: `Page size, at most ${MAX_LIMIT}.` },
      },
      required: [],
    },
    async execute(input) {
      const parsed = (input ?? {}) as { beforeSeq?: number; limit?: number };
      const events = await deps.events.listByThread(deps.threadId);
      return readThreadHistory(events, deps.threadId, {
        ...(parsed.beforeSeq !== undefined ? { beforeSeq: parsed.beforeSeq } : {}),
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      });
    },
  });
}
