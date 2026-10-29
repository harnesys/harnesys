import type { CapabilityScope } from '../../domain/pack.ts';
import type { ThreadsPort } from '../../ports/threads.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
export interface CreateThreadToolsParams {
  threads: ThreadsPort;
  resolveScope: () => CapabilityScope;
}
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
    tool('thread_list', {
      group: 'schedules',
      description:
        "List threads in this project. Each id works with schedule_set threadId to wake that conversation and with thread_tail to read that thread's event journal (runs, failures, comments). current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).",
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
            hint: 'To see what happened inside a thread (run events, failures, comments), call thread_tail with its threadId; load it via load_tools if not loaded yet.',
          };
        }),
    }),
  ];
}
