import type { CapabilityScope } from '../domain/pack.ts';
export interface ThreadSummary {
  id: string;
  title: string;
  kind: string;
  agentId: string;
  agentName: string;
  hasSchedule: boolean;
}
export interface ThreadsPort {
  list(scope: CapabilityScope): Promise<ThreadSummary[]>;
}
