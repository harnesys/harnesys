import type { ManagerPulse, ManagerThreadTailItem, ManagerUsageReport } from '../domain/manager.ts';
import type { CapabilityScope } from '../domain/pack.ts';
export type ManagerUsageGroupBy = 'day' | 'agent';
export interface ManagerUsageQuery {
  from?: string;
  to?: string;
  groupBy?: ManagerUsageGroupBy;
}
export abstract class ManagerObservationPort {
  abstract pulse(scope: CapabilityScope): Promise<ManagerPulse>;
  abstract usage(scope: CapabilityScope, query: ManagerUsageQuery): Promise<ManagerUsageReport>;
  abstract threadTail(
    scope: CapabilityScope,
    threadId: string,
    limit: number,
  ): Promise<ManagerThreadTailItem[]>;
}
