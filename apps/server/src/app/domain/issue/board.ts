import type {
  BoardRuleInput,
  BoardStatus,
  BoardStatusInput,
  IssueBoardStatus,
  RuleAction,
  RuleCondition,
  RuleTrigger,
} from '@harnesys/contracts';

export interface IssueBoardRecord {
  id: string;
  orgId: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: IssueBoardStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statuses: BoardStatus[];
  rules: BoardRuleRecord[];
}

export interface IssueBoardInsert {
  id: string;
  orgId: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: IssueBoardStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statuses: BoardStatus[];
}

export type IssueBoardPatch = Partial<{
  name: string;
  description: string;
  color: string;
  icon: string;
  status: IssueBoardStatus;
  archivedAt: string | null;
  updatedAt: string;
}>;

export interface BoardRuleRecord {
  id: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  position: number;
  enabled: boolean;
  createdByUserId: string | null;
}

export interface BoardRuleWrite extends BoardRuleInput {
  id?: string;
  createdByUserId?: string | null;
}

export type { BoardRuleInput, BoardStatus, BoardStatusInput };
