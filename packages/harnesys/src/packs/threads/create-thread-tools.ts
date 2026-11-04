import type { CapabilityScope } from '../../domain/pack.ts';
import type { ThreadHistoryQuery, ThreadSearchQuery, ThreadsPort } from '../../ports/threads.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateThreadToolsParams {
  threads: ThreadsPort;
  resolveScope: () => CapabilityScope;
}

interface ThreadTailToolInput {
  threadId: string;
  limit?: number;
}

const TAIL_DEFAULT_LIMIT = 20;
const SEARCH_SCOPES = ['thread', 'org'];

async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function createThreadTools(deps: CreateThreadToolsParams): ToolDefinition[] {
  return [
    tool('threads_list', {
      group: 'schedules',
      description:
        "List threads in this project. Each id works with schedule_set threadId to wake that conversation and with threads_tail to read that thread's event journal (runs, failures, comments). current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).",
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const threads = await deps.threads.list(scope);
          return {
            threads: threads.map((row) => ({
              id: row.id,
              title: row.title,
              kind: row.kind,
              agentId: row.agentId,
              agentName: row.agentName,
              current: row.id === scope.threadId,
              hasSchedule: row.hasSchedule ?? false,
            })),
            hint: 'To see what happened inside a thread (run events, failures, comments), call threads_tail with its threadId; load it via load_tools if not loaded yet. Use threads_history or threads_search for thread transcripts.',
          };
        }),
    }),
    tool('threads_history', {
      group: 'thread',
      description:
        'Read older conversational messages of a thread before the current window. Defaults to this thread; pass threadId to read another thread in this project. People messages and final answers are returned in thread order; pass beforeSeq to page further back. Use threads_search to find a specific phrase.',
      operations: ['read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Thread to read. Defaults to this chat.' },
          beforeSeq: {
            type: 'number',
            description: 'Return messages older than this thread sequence. Defaults to the end.',
          },
          limit: { type: 'number', description: 'Page size, at most 50.' },
        },
        required: [],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const input = (raw ?? {}) as ThreadHistoryQuery;
          return await deps.threads.history(deps.resolveScope(), input);
        }),
    }),
    tool('threads_search', {
      group: 'thread',
      description:
        'Keyword search over thread transcripts. scope=thread (default) searches this thread; scope=org searches every thread in the project, optionally narrowed by threadId. Returns matching snippets with threadId and threadSeq, newest first; pass them to threads_history to read the surrounding messages.',
      operations: ['read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to match in message text.' },
          scope: {
            type: 'string',
            enum: SEARCH_SCOPES,
            description: 'thread = this chat, org = every thread in the project.',
          },
          threadId: {
            type: 'string',
            description: 'Restrict an org search to one thread, or target another thread.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max hits.' },
        },
        required: ['query'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ThreadSearchQuery;
          return await deps.threads.search(deps.resolveScope(), input);
        }),
    }),
    tool('threads_tail', {
      group: 'thread',
      description:
        'Last events of a thread (run journal: runId, kind, timestamp, preview). threadId comes from threads_list rows or manager_pulse failedThreads; load missing tools via load_tools. limit 1..100, default 20.',
      input: {
        type: 'object',
        properties: {
          threadId: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['threadId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ThreadTailToolInput;
          return await deps.threads.tail(
            deps.resolveScope(),
            input.threadId,
            input.limit ?? TAIL_DEFAULT_LIMIT,
          );
        }),
    }),
  ];
}
