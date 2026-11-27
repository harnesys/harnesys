import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  IssueDependencyType,
  IssueTrackerPort,
  IssueType,
  IssueUpdateInput,
} from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runBatch } from './batch.ts';
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
  workspaceSubpath?: string;
  branch?: string;
  worktreeOnStatus?: string;
}
interface IssueCreateToolInput extends Partial<IssueCreateInput> {
  issues?: IssueCreateInput[];
}
interface IssueUpdateEntry {
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
  workspaceSubpath?: string;
  branch?: string;
  worktreeOnStatus?: string;
}
interface IssueUpdateToolInput extends Partial<IssueUpdateEntry> {
  updates?: IssueUpdateEntry[];
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
    workspaceSubpath: clearable(input.workspaceSubpath),
    branch: clearable(input.branch),
    worktreeOnStatus: clearable(input.worktreeOnStatus),
  };
}
const issueCreateProperties = {
  boardId: {
    type: 'string',
    description:
      'Board id from issue_board_list; the board must already exist (board_create). In an issues batch it is also the default board for entries without their own boardId',
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
    description:
      'Source id from source_list the issue runs in; omitted means the organization Workspace (isWorkspace). All agents the issue is handed to run in this same location',
  },
  workspaceSubpath: {
    type: 'string',
    description:
      'Optional subfolder inside the issue source the run works in (relative, no ".."). Created on the first run and shared by every agent',
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
};
const issueUpdateProperties = {
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
    description:
      'Source id from source_list; "clear" falls back to the organization Workspace. All agents the issue is handed to run in this location',
  },
  workspaceSubpath: {
    type: 'string',
    description:
      'Subfolder inside the issue source; "clear" removes it. Changing the source clears it unless passed explicitly',
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
};
export function createIssueWorkspaceTools(deps: CreateIssueWorkspaceToolsParams): ToolDefinition[] {
  const createEntry = (scope: CapabilityScope, entry: IssueCreateInput) =>
    deps.issues.create(scope, {
      boardId: entry.boardId,
      title: entry.title,
      description: entry.description,
      statusKey: entry.statusKey,
      priority: entry.priority,
      type: entry.type,
      labels: entry.labels,
      assigneeAgentId: entry.assigneeAgentId ?? null,
      parentIssueId: entry.parentIssueId,
      dueDate: entry.dueDate ?? null,
      dependencies: entry.dependencies,
      sourceId: entry.sourceId,
      workspaceSubpath: entry.workspaceSubpath,
      branch: entry.branch,
      worktreeOnStatus: entry.worktreeOnStatus,
    });
  return [
    tool('issue_create', {
      group: 'issues',
      description:
        'Create an issue on a board (boardId from issue_board_list). Creating in a work column with an assignee fires that agent. dependencies adds blockers at creation. The issue location belongs to the issue, not to the agent: every run on it, by any agent it is handed to, uses the same source. Pass sourceId (source_list) and optional branch; without sourceId the issue runs in the organization Workspace (the isWorkspace entry in source_list). With a branch, a worktree for that branch is used when it exists, otherwise a checkout on that branch, otherwise the run is held until a worktree exists — create one on the issue card (Create now / auto on status). One issue or an issues batch; in a batch a top-level boardId is the default for entries without their own; a batch reports { created, issues, failed }.',
      input: {
        type: 'object',
        properties: {
          ...issueCreateProperties,
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: issueCreateProperties,
              required: ['title'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueCreateToolInput;
          if (input.issues !== undefined) {
            if (input.title !== undefined) {
              throw new Error('Provide either title or issues, not both');
            }
            const outcome = await runBatch(
              input.issues,
              'issues',
              (entry) => {
                const boardId = entry.boardId ?? input.boardId;
                if (boardId === undefined) {
                  throw new Error(
                    'entry needs boardId, or pass a top-level boardId as the batch default',
                  );
                }
                return createEntry(scope, { ...entry, boardId });
              },
              (entry, error) => ({ title: entry.title, error }),
            );
            return { created: outcome.done, issues: outcome.items, failed: outcome.failed };
          }
          if (input.boardId === undefined || input.title === undefined) {
            throw new Error('Provide boardId and title, or an issues array');
          }
          return await createEntry(scope, {
            ...input,
            boardId: input.boardId,
            title: input.title,
          });
        }),
    }),
    tool('issue_update', {
      group: 'issues',
      description:
        'Edit issues without changing their column: title, description, priority (1..4), type, labels, assigneeAgentId (use "unassign" to clear), dueDate (use "clear"), boardId, sourceId/branch for the issue location (use "clear" on sourceId to fall back to the organization Workspace), worktreeOnStatus. The location belongs to the issue: every agent it is handed to runs in the same place. Reassigning in a work column fires the new agent. One issueId or an updates batch; a batch reports { updated, failed }.',
      input: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          ...issueUpdateProperties,
          updates: {
            type: 'array',
            items: {
              type: 'object',
              properties: { issueId: { type: 'string' }, ...issueUpdateProperties },
              required: ['issueId'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueUpdateToolInput;
          if (input.updates !== undefined) {
            if (input.issueId !== undefined) {
              throw new Error('Provide either issueId or updates, not both');
            }
            const outcome = await runBatch(
              input.updates,
              'updates',
              (entry) => deps.issues.update(scope, entry.issueId, issueUpdatePatch(entry)),
              (entry, error) => ({ issueId: entry.issueId, error }),
            );
            return { updated: outcome.done, failed: outcome.failed };
          }
          if (input.issueId === undefined) {
            throw new Error('Provide issueId or an updates array');
          }
          return await deps.issues.update(scope, input.issueId, issueUpdatePatch(input));
        }),
    }),
  ];
}
