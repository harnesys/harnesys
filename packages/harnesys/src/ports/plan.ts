import type { CapabilityScope } from '../domain/pack.ts';
import type { PlanItemStatus, PlanStatus, SubagentRole } from '../domain/plan.ts';
export interface PlanItem {
  id: string;
  order: number;
  title: string;
  description: string;
  status: PlanItemStatus;
  subagentRole?: SubagentRole | null;
  resultNote?: string | null;
}
export interface PlanSnapshot {
  id: string;
  status: PlanStatus;
  overview: string;
  items: PlanItem[];
}
export interface PlanSaveItemInput {
  title: string;
  description: string;
  subagentRole?: SubagentRole | null;
}
export interface PlanPort {
  save(
    scope: CapabilityScope,
    input: {
      overview: string;
      items: PlanSaveItemInput[];
      status?: PlanStatus;
    },
  ): Promise<PlanSnapshot>;
  updateItem(
    scope: CapabilityScope,
    input: {
      planId: string;
      itemId: string;
      status: PlanItemStatus;
      resultNote?: string | null;
    },
  ): Promise<PlanSnapshot>;
  get(scope: CapabilityScope): Promise<PlanSnapshot | null>;
  delete(scope: CapabilityScope): Promise<{
    deleted: boolean;
  }>;
}
