import type { PlanItemStatus, PlanStatus, SubagentRole } from 'harnesys/domain';

export type { PlanItemStatus, PlanStatus, SubagentRole } from 'harnesys/domain';
export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from 'harnesys/domain';
export interface PlanItemRecord {
  id: string;
  planId: string;
  order: number;
  title: string;
  description: string;
  status: PlanItemStatus;
  subagentRole?: SubagentRole | null;
  resultNote?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ThreadPlanRecord {
  id: string;
  threadId: string;
  status: PlanStatus;
  overview: string;
  items: PlanItemRecord[];
  createdAt: string;
  updatedAt: string;
}
export interface SavePlanItemInput {
  id?: string;
  title: string;
  description: string;
  subagentRole?: SubagentRole | null;
}
export interface SavePlanRequest {
  threadId: string;
  overview: string;
  items: SavePlanItemInput[];
  status?: PlanStatus;
}
export interface UpdatePlanItemRequest {
  planId: string;
  itemId: string;
  status: PlanItemStatus;
  resultNote?: string | null;
}
