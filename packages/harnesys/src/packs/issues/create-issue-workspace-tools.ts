import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  IssueDependencyType,
  IssueTrackerPort,
  IssueType,
  IssueUpdateInput,
} from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { DEPENDENCY_TYPES, ISSUE_TYPES } from './create-issue-tools.ts';
import { runGuard } from './run-guard.ts';
export interface CreateIssueWorkspaceToolsParams {
  issues: IssueTrackerPort;
  resolveScope: () => CapabilityScope;
}
interface IssueCreateInput {
  boardId: string;
  title: string;
  description?: string;
  statusKey?: string;
  priority?: number;
  type?: IssueType;
  labels?: string[];
  assigneeAgentId?: string;
  parentIssueId?: string;
  dueDate?: string;
  dependencies?: Array<{ dependsOnIssueId: string; type?: IssueDependencyType }>;
  sourceId?: string;
  branch?: string;
  worktreeOnStatus?: string;
}
interface IssueUpdateToolInput {
  issueId: string;
  boardId?: string;
  title?: string;
  description?: string;
  priority?: number;
  type?: IssueType;
  labels?: string[];
  assigneeAgentId?: string;
  dueDate?: string;
  sourceId?: string;
  branch?: string;
  worktreeOnStatus?: string;
}
function clearable(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === 'clear' ? null : value;
}
function issueUpdatePatch(input: IssueUpdateToolInput): IssueUpdateInput {
  return {
    boardId: input.boardId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    type: input.type,
    labels: input.labels,
    assigneeAgentId:
      input.assigneeAgentId === 'unassign' ? null : (input.assigneeAgentId ?? undefined),
    dueDate: clearable(input.dueDate),
    sourceId: clearable(input.sourceId),
    branch: clearable(input.branch),
    worktreeOnStatus: clearable(input.worktreeOnStatus),
  };
}
export function createIssueWorkspaceTools(deps: CreateIssueWorkspaceToolsParams): ToolDefinition[] {
  return [
    tool('issue_create', {
      group: 'issues',
      description:
        'Create an issue on a board (boardId from issue_board_list). Creating in a work column with an assignee fires that agent. dependencies adds blockers at creation. Issues run in the bound source on the given branch. If a worktree exists for the branch the run uses it; if the source checkout is on the branch the run uses the checkout; otherwise the run is held until a worktree exists — create one on the issue card (Create now / auto on status).',
      input: {
        type: 'object',
        properties: {
          boardId: {
            type: 'string',
            description:
              'Board id from issue_board_list; the board must already exist (board_create)',
          },
          title: { type: 'string' },
          description: { type: 'string' },
          statusKey: {
            type: 'string',
            description: 'Board status key (see issue_board_list statuses)',
          },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          type: { type: 'string', enum: ISSUE_TYPES },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Label ids or exact existing label titles (label_list); unknown labels fail — create them with label_create first',
          },
          assigneeAgentId: { type: 'string' },
          parentIssueId: { type: 'string' },
          dueDate: { type: 'string' },
          sourceId: {
            type: 'string',
            description: 'Source id from source_list the issue runs in',
          },
          branch: {
            type: 'string',
            description: 'Git branch for the run; the source must be a git source',
          },
          worktreeOnStatus: {
            type: 'string',
            description:
              'Board status key: entering it auto-creates a worktree for the branch (needs sourceId + branch)',
          },
          dependencies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dependsOnIssueId: { type: 'string' },
                type: { type: 'string', enum: DEPENDENCY_TYPES },
              },
              required: ['dependsOnIssueId'],
            },
          },
        },
        required: ['boardId', 'title'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueCreateInput;
          return await deps.issues.create(scope, {
            boardId: input.boardId,
            title: input.title,
            description: input.description,
            statusKey: input.statusKey,
            priority: input.priority,
            type: input.type,
            labels: input.labels,
            assigneeAgentId: input.assigneeAgentId ?? null,
            parentIssueId: input.parentIssueId,
            dueDate: input.dueDate ?? null,
            dependencies: input.dependencies,
            sourceId: input.sourceId,
            branch: input.branch,
            worktreeOnStatus: input.worktreeOnStatus,
          });
        }),
    }),
    tool('issue_update', {
      group: 'issues',
      description:
        'Edit an issue without changing its column: title, description, priority (1..4), type, labels, assigneeAgentId (use "unassign" to clear), dueDate (use "clear"), boardId, sourceId/branch for the run workspace (use "clear" to unbind), worktreeOnStatus. Reassigning in a work column fires the new agent.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          boardId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          type: { type: 'string', enum: ISSUE_TYPES },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Label ids or exact existing label titles (label_list); unknown labels fail — create them with label_create first',
          },
          assigneeAgentId: { type: 'string' },
          dueDate: { type: 'string' },
          sourceId: {
            type: 'string',
            description: 'Source id from source_list; "clear" unbinds',
          },
          branch: {
            type: 'string',
            description: 'Git branch for the run; "clear" unbinds',
          },
          worktreeOnStatus: {
            type: 'string',
            description:
              'Board status key: entering it auto-creates a worktree for the branch; "clear" disables',
          },
        },
        required: ['issueId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueUpdateToolInput;
          return await deps.issues.update(scope, input.issueId, issueUpdatePatch(input));
        }),
    }),
  ];
}
