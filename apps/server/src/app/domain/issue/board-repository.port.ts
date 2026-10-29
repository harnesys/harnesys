import type { BoardStatus, BoardStatusInput } from '@harnesys/contracts';
import type {
  BoardRuleRecord,
  BoardRuleWrite,
  IssueBoardInsert,
  IssueBoardPatch,
  IssueBoardRecord,
} from './board.ts';

export abstract class IssueBoardRepositoryPort {
  abstract listByOrg(orgId: string): IssueBoardRecord[];
  abstract findById(orgId: string, id: string): IssueBoardRecord | undefined;
  abstract insert(rec: IssueBoardInsert): IssueBoardRecord;
  abstract update(orgId: string, id: string, patch: IssueBoardPatch): IssueBoardRecord;
  abstract delete(orgId: string, id: string): void;
  abstract addStatus(orgId: string, boardId: string, input: BoardStatusInput): BoardStatus;
  abstract updateStatus(
    orgId: string,
    boardId: string,
    key: string,
    input: BoardStatusInput,
  ): BoardStatus;
  abstract removeStatus(orgId: string, boardId: string, key: string): void;
  abstract reorderStatuses(orgId: string, boardId: string, order: string[]): void;
  abstract saveRule(orgId: string, boardId: string, input: BoardRuleWrite): BoardRuleRecord;
  abstract removeRule(orgId: string, boardId: string, ruleId: string): void;
  abstract reorderRules(orgId: string, boardId: string, order: string[]): void;
}
