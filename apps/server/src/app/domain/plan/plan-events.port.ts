import type { ThreadPlanRecord } from '@harnesys/studio-shared';

export type PlanEvent =
  | { type: 'saved'; plan: ThreadPlanRecord }
  | { type: 'deleted'; threadId: string };

export type PlanEventListener = (orgId: string, event: PlanEvent) => void;

export abstract class PlanEventsPort {
  abstract subscribe(listener: PlanEventListener): () => void;
  abstract emit(orgId: string, event: PlanEvent): void;
}
