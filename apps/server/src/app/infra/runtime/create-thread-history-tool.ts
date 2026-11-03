import type { RunEventStore, SessionEvent, ToolDefinition } from 'harnesys';
import { tool } from 'harnesys';

export const THREAD_HISTORY_TOOL = 'thread_history';

export interface ThreadHistoryToolDeps {
  threadId: string;
  events: RunEventStore;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function createThreadHistoryTool(deps: ThreadHistoryToolDeps): ToolDefinition {
  return tool(THREAD_HISTORY_TOOL, {
    description:
      'Read older conversational messages of this thread before the current window. People messages and final answers are returned in thread order; pass beforeSeq to page further back.',
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
      const limit = Math.min(Math.max(parsed.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
      const events = await deps.events.listByThread(deps.threadId);
      const conversational = events.filter(
        (event) => event.conversational === true && event.threadSeq !== undefined,
      );
      const before = parsed.beforeSeq ?? Number.MAX_SAFE_INTEGER;
      const older = conversational.filter((event) => (event.threadSeq ?? 0) < before);
      const slice = older.slice(-limit);
      const messages = slice.map(toMessage).filter((item) => item !== null);
      return {
        messages,
        hasMore: older.length > slice.length,
        oldestSeq: messages[0]?.threadSeq ?? null,
      };
    },
  });
}

function toMessage(event: SessionEvent): {
  threadSeq: number;
  role: 'user' | 'assistant';
  author?: string;
  text: string;
} | null {
  const threadSeq = event.threadSeq ?? 0;
  if (event.type === 'user') {
    const author = event.author?.displayName;
    return {
      threadSeq,
      role: 'user',
      ...(author ? { author } : {}),
      text: event.text,
    };
  }
  if (event.type === 'run.completed') {
    return { threadSeq, role: 'assistant', text: event.text ?? '' };
  }
  return null;
}
