import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  IssueDependencyType,
  IssueListFilter,
  IssueTrackerPort,
  IssueType,
} from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
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
interface IssueMoveToolInput {
  issueId: string;
  to: string;
  assigneeAgentId?: string;
  comment?: string;
}
interface IssueGetInput {
  issueId: string;
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
interface IssueCommentInput {
  issueId: string;
  body: string;
}
interface IssueDependencyInput {
  issueId: string;
  action: 'add' | 'remove';
  dependsOnIssueId: string;
  type?: IssueDependencyType;
}
interface IssueAttachmentAddInput {
  issueId: string;
  sourceId: string;
  sourcePath: string;
  name?: string;
}
export function createIssueTools(deps: CreateIssueToolsParams): ToolDefinition[] {
  return [
    tool('issue_move', {
      group: 'issues',
      description:
        'Move an issue to another column by status key (transitions are free within the board). Optional assignee override (fires the new agent in a started column; omit to keep the current assignee) and optional comment.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          to: { type: 'string', description: 'Target board status key (free transition)' },
          assigneeAgentId: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['issueId', 'to'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueMoveToolInput;
          return await deps.issues.move(scope, input.issueId, {
            to: input.to,
            ...(input.assigneeAgentId !== undefined
              ? { assigneeAgentId: input.assigneeAgentId }
              : {}),
            comment: input.comment,
          });
        }),
    }),
    tool('issue_nudge', {
      group: 'issues',
      description:
        'Re-fire the assigned agent on a work-column issue (falls back to the column rule agent). Use after editing description/title so the agent sees fresh content. Resets the last-fired guard.',
      input: {
        type: 'object',
        properties: { issueId: { type: 'string' } },
        required: ['issueId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          return await deps.issues.nudge(scope, (raw as { issueId: string }).issueId);
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
      description: 'Add a comment to an issue on behalf of this agent.',
      input: {
        type: 'object',
        properties: { issueId: { type: 'string' }, body: { type: 'string' } },
        required: ['issueId', 'body'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueCommentInput;
          return await deps.issues.comment(scope, input.issueId, input.body);
        }),
    }),
    tool('issue_dependency', {
      group: 'issues',
      description:
        'Link issues: action=add|remove a dependency of this issue on another (type blocks|relates|duplicate, default blocks). blocks dependencies gate moving into work columns.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          action: { type: 'string', enum: ['add', 'remove'] },
          dependsOnIssueId: { type: 'string' },
          type: { type: 'string', enum: DEPENDENCY_TYPES },
        },
        required: ['issueId', 'action', 'dependsOnIssueId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueDependencyInput;
          if (input.action === 'remove') {
            await deps.issues.removeDependency(scope, input.issueId, input.dependsOnIssueId);
            return {
              ok: true,
              action: 'remove',
              issueId: input.issueId,
              dependsOnIssueId: input.dependsOnIssueId,
            };
          }
          await deps.issues.addDependency(scope, input.issueId, input.dependsOnIssueId, input.type);
          return {
            ok: true,
            action: 'add',
            issueId: input.issueId,
            dependsOnIssueId: input.dependsOnIssueId,
          };
        }),
    }),
    tool('issue_attachment_add', {
      group: 'issues',
      description:
        'Attach a source file reference to an issue: sourceId + sourcePath from file tools (e.g. from file_search). Use issue_get to list attachments.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          sourceId: { type: 'string' },
          sourcePath: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['issueId', 'sourceId', 'sourcePath'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueAttachmentAddInput;
          return await deps.issues.addSourceAttachment(scope, input.issueId, {
            sourceId: input.sourceId,
            sourcePath: input.sourcePath,
            name: input.name,
          });
        }),
    }),
  ];
}
