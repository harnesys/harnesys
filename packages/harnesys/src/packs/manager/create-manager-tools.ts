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
  ];
}
