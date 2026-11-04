import { definePack } from '../../domain/pack.ts';
import type { ManagerObservationPort } from '../../ports/manager-observation.ts';
import { createManagerTools } from './create-manager-tools.ts';
export interface ManagerCapabilityPorts {
  observation: ManagerObservationPort;
}
export const managerCapability = definePack<ManagerCapabilityPorts, Record<string, unknown>>({
  name: 'manager',
  version: '1.0.0',
  description: 'Manager observation: manager_pulse / usage_report',
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
