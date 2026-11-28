import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  IssueDependencyType,
  IssueListFilter,
  IssueTrackerPort,
  IssueTransitionResult,
  IssueType,
} from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runBatch } from './batch.ts';
import { runGuard } from './run-guard.ts';
export const ISSUE_TYPES: IssueType[] = [
  'task',
  'bug',
  'research',
  'feature',
  'improvement',
  'review',
];
export const DEPENDENCY_TYPES: IssueDependencyType[] = ['blocks', 'relates', 'duplicate'];
export interface CreateIssueToolsParams {
  issues: IssueTrackerPort;
  resolveScope: () => CapabilityScope;
}
interface IssueMoveEntry {
  issueId: string;
  to: string;
  assigneeAgentId?: string;
  comment?: string;
}
interface IssueMoveToolInput extends Partial<IssueMoveEntry> {
  moves?: IssueMoveEntry[];
}
interface IssueGetInput {
  issueId: string;
}
interface IssueNudgeToolInput {
  issueId?: string;
  issueIds?: string[];
}
interface IssueListToolInput {
  boardId?: string;
  statusKey?: string;
  assigneeAgentId?: string;
  labelId?: string;
  priority?: number;
  type?: IssueType;
  limit?: number;
}
interface IssueCommentEntry {
  issueId: string;
  body: string;
}
interface IssueCommentToolInput {
  issueId?: string;
  body?: string;
  comments?: IssueCommentEntry[];
}
function suppressedMoves(items: IssueTransitionResult[]) {
  return items.flatMap((moved) =>
    moved.fireSuppressed === undefined
      ? []
      : [{ issueId: moved.id, fireSuppressed: moved.fireSuppressed }],
  );
}
const issueMoveProperties = {
  issueId: { type: 'string' },
  to: { type: 'string', description: 'Target board status key (free transition)' },
  assigneeAgentId: { type: 'string' },
  comment: { type: 'string' },
};
const issueCommentProperties = {
  issueId: { type: 'string' },
  body: { type: 'string' },
};
export function createIssueTools(deps: CreateIssueToolsParams): ToolDefinition[] {
  const moveEntry = (scope: CapabilityScope, entry: IssueMoveEntry) =>
    deps.issues.move(scope, entry.issueId, {
      to: entry.to,
      ...(entry.assigneeAgentId !== undefined ? { assigneeAgentId: entry.assigneeAgentId } : {}),
      comment: entry.comment,
    });
  return [
    tool('issue_move', {
      group: 'issues',
      description:
        'Move issues to another column by status key (transitions are free within the board): one issueId/to or a moves batch. Optional assignee override per entry (fires the new agent in a started column; omit to keep the current assignee) and optional comment per entry. A move onto a started column with open blocks dependencies succeeds but fires no agent: the result then carries fireSuppressed naming the open blocker issues. A batch applies entries one by one and reports { moved, failed, suppressed }, suppressed listing entries that fired no agent.',
      input: {
        type: 'object',
        properties: {
          ...issueMoveProperties,
          moves: {
            type: 'array',
            items: {
              type: 'object',
              properties: issueMoveProperties,
              required: ['issueId', 'to'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueMoveToolInput;
          if (input.moves !== undefined) {
            if (input.issueId !== undefined || input.to !== undefined) {
              throw new Error('Provide either issueId/to or moves, not both');
            }
            const outcome = await runBatch(
              input.moves,
              'moves',
              (entry) => moveEntry(scope, entry),
              (entry, error) => ({ issueId: entry.issueId, to: entry.to, error }),
            );
            const suppressed = suppressedMoves(outcome.items);
            return { moved: outcome.done, failed: outcome.failed, suppressed };
          }
          if (input.issueId === undefined || input.to === undefined) {
            throw new Error('Provide issueId and to, or a moves array');
          }
          return await moveEntry(scope, { ...input, issueId: input.issueId, to: input.to });
        }),
    }),
    tool('issue_nudge', {
      group: 'issues',
      description:
        'Re-fire the assigned agent on work-column issues (falls back to the column rule agent): one issueId or an issueIds batch. Use after editing description/title so the agent sees fresh content. Resets the last-fired guard. A batch applies one by one and reports { nudged, failed }.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          issueIds: { type: 'array', items: { type: 'string' } },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueNudgeToolInput;
          if (input.issueIds !== undefined) {
            if (input.issueId !== undefined) {
              throw new Error('Provide either issueId or issueIds, not both');
            }
            const outcome = await runBatch(
              input.issueIds,
              'issueIds',
              (issueId) => deps.issues.nudge(scope, issueId),
              (issueId, error) => ({ issueId, error }),
            );
            return { nudged: outcome.done, failed: outcome.failed };
          }
          if (input.issueId === undefined) {
            throw new Error('Provide issueId or an issueIds array');
          }
          return await deps.issues.nudge(scope, input.issueId);
        }),
    }),
    tool('issue_get', {
      group: 'issues',
      description:
        'Full issue view: comments, subtasks, dependencies/dependents, attachments and board automation rules (which agent picks the issue up in a status).',
      input: {
        type: 'object',
        properties: { issueId: { type: 'string' } },
        required: ['issueId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          return await deps.issues.get(scope, (raw as IssueGetInput).issueId);
        }),
    }),
    tool('issue_list', {
      group: 'issues',
      description:
        'List issues with filters: board, status, assignee, label, priority, type. limit defaults to 50, max 200.',
      input: {
        type: 'object',
        properties: {
          boardId: { type: 'string' },
          statusKey: {
            type: 'string',
            description: 'Board status key (see issue_board_list statuses)',
          },
          assigneeAgentId: { type: 'string' },
          labelId: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          type: { type: 'string', enum: ISSUE_TYPES },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueListToolInput;
          const filter: IssueListFilter = {
            boardId: input.boardId,
            statusKey: input.statusKey,
            assigneeAgentId: input.assigneeAgentId,
            labelId: input.labelId,
            priority: input.priority,
            type: input.type,
            limit: input.limit,
          };
          return { items: await deps.issues.list(scope, filter) };
        }),
    }),
    tool('issue_comment', {
      group: 'issues',
      description:
        'Add comments to issues on behalf of this agent: one issueId/body or a comments batch. A batch applies one by one and reports { commented, failed }.',
      input: {
        type: 'object',
        properties: {
          ...issueCommentProperties,
          comments: {
            type: 'array',
            items: {
              type: 'object',
              properties: issueCommentProperties,
              required: ['issueId', 'body'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueCommentToolInput;
          if (input.comments !== undefined) {
            if (input.issueId !== undefined || input.body !== undefined) {
              throw new Error('Provide either issueId/body or comments, not both');
            }
            const outcome = await runBatch(
              input.comments,
              'comments',
              (entry) => deps.issues.comment(scope, entry.issueId, entry.body),
              (entry, error) => ({ issueId: entry.issueId, error }),
            );
            return { commented: outcome.done, failed: outcome.failed };
          }
          if (input.issueId === undefined || input.body === undefined) {
            throw new Error('Provide issueId and body, or a comments array');
          }
          return await deps.issues.comment(scope, input.issueId, input.body);
        }),
    }),
  ];
}
