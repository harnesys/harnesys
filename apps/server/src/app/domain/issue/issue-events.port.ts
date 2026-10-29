import type { IssueBoardRecord } from './board.ts';
import type { IssueRecord } from './issue.ts';
import type { IssueLabelRecord } from './label.ts';

export type IssueDomainEvent =
  | { type: 'issue'; issue: IssueRecord }
  | { type: 'issue-deleted'; issueId: string; boardId: string }
  | { type: 'board'; board: IssueBoardRecord }
  | { type: 'board-deleted'; boardId: string }
  | { type: 'rule-notification'; boardId: string; issueId: string; text: string }
  | { type: 'label'; label: IssueLabelRecord }
  | { type: 'label-deleted'; labelId: string };

export type IssueDomainEventListener = (orgId: string, event: IssueDomainEvent) => void;

export abstract class IssueEventsPort {
  abstract subscribe(listener: IssueDomainEventListener): () => void;
  abstract emit(orgId: string, event: IssueDomainEvent): void;
}
