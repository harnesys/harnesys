import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  ManagerObservationPort,
  ManagerUsageGroupBy,
} from '../../ports/manager-observation.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
export interface CreateManagerToolsParams {
  observation: ManagerObservationPort;
  resolveScope: () => CapabilityScope;
}
interface ManagerUsageToolInput {
  from?: string;
  to?: string;
  groupBy?: ManagerUsageGroupBy;
}
interface ManagerThreadTailToolInput {
  threadId: string;
  limit?: number;
}
const USAGE_GROUP_BYS: ManagerUsageGroupBy[] = ['day', 'agent'];
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
export function createManagerTools(deps: CreateManagerToolsParams): ToolDefinition[] {
  return [
    tool('manager_pulse', {
      group: 'manager',
      description:
        'Read-only org snapshot: agents with today spend vs daily budget, failed threads, pending approvals, open issues and total spend today. Start here for any "how is the org doing" question.',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          return await deps.observation.pulse(deps.resolveScope());
        }),
    }),
    tool('usage_report', {
      group: 'manager',
      description:
        'Token and cost usage aggregated by day or by agent (groupBy day|agent) over an optional from/to window. Rows carry input/output tokens, cost in USD and run count.',
      input: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          groupBy: { type: 'string', enum: USAGE_GROUP_BYS },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ManagerUsageToolInput;
          return await deps.observation.usage(deps.resolveScope(), {
            from: input.from,
            to: input.to,
            groupBy: input.groupBy,
          });
        }),
    }),
    tool('thread_tail', {
      group: 'manager',
      description:
        'Last events of a thread (run journal: runId, kind, timestamp, preview). threadId comes from thread_list rows or manager_pulse failedThreads; load missing tools via load_tools. limit 1..100, default 20.',
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
          const input = raw as ManagerThreadTailToolInput;
          const requested = input.limit === undefined || input.limit < 1 ? 20 : input.limit;
          return await deps.observation.threadTail(
            deps.resolveScope(),
            input.threadId,
            Math.min(requested, 100),
          );
        }),
    }),
  ];
}
