import { definePack } from '../../domain/pack.ts';
import type { ManagerObservationPort } from '../../ports/manager-observation.ts';
import { createManagerTools } from './create-manager-tools.ts';
export interface ManagerCapabilityPorts {
  observation: ManagerObservationPort;
}
export const managerCapability = definePack<ManagerCapabilityPorts, Record<string, unknown>>({
  name: 'manager',
  version: '1.0.0',
  description: 'Manager observation: manager_pulse / usage_report / thread_tail',
  icon: 'manager',
  meta: {
    tools: [
      {
        name: 'manager_pulse',
        description:
          'Read-only org snapshot: agents with today spend vs daily budget, failed threads, pending approvals, open issues and total spend today. Start here for any "how is the org doing" question.',
      },
      {
        name: 'usage_report',
        description:
          'Token and cost usage aggregated by day or by agent (groupBy day|agent) over an optional from/to window. Rows carry input/output tokens, cost in USD and run count.',
      },
      {
        name: 'thread_tail',
        description:
          'Last events of a thread (run journal: runId, kind, timestamp, preview). threadId comes from thread_list rows or manager_pulse failedThreads; load missing tools via load_tools. limit 1..100, default 20.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createManagerTools({
      observation: ctx.ports.observation,
      resolveScope: () => ctx.scope,
    }),
  }),
});
