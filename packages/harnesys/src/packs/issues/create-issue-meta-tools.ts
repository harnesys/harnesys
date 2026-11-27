import { ENTITY_COLOR_NAMES } from '@harnesys/contracts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  BoardRuleInput,
  IssueBoardCreateInput,
  IssueBoardUpdateInput,
  IssueTrackerPort,
  RuleAction,
  RuleCondition,
  RuleTrigger,
} from '../../ports/issue-tracker.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runBatch } from './batch.ts';
import { runGuard } from './run-guard.ts';
export interface CreateIssueMetaToolsParams {
  issues: IssueTrackerPort;
  resolveScope: () => CapabilityScope;
}
interface LabelCreateEntry {
  title: string;
  color?: string;
}
interface LabelCreateToolInput extends Partial<LabelCreateEntry> {
  labels?: LabelCreateEntry[];
}
interface LabelDeleteToolInput {
  labelId?: string;
  labelIds?: string[];
  confirm: boolean;
}
interface BoardRuleSaveInput {
  boardId: string;
  ruleId?: string;
  trigger: RuleTrigger;
  conditions?: RuleCondition[];
  actions: RuleAction[];
  position?: number;
  enabled?: boolean;
}
interface BoardRuleDeleteInput {
  boardId: string;
  ruleId: string;
  confirm: boolean;
}
export function createIssueMetaTools(deps: CreateIssueMetaToolsParams): ToolDefinition[] {
  return [
    tool('issue_board_list', {
      group: 'issues',
      description:
        'List issue boards with their statuses and automation rules (trigger/conditions/actions triples).',
      input: { type: 'object' },
      execute: () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          return { items: await deps.issues.listBoards(scope) };
        }),
    }),
    tool('source_list', {
      group: 'issues',
      description:
        'List sources an issue can bind to for its runs (issue_create/issue_update sourceId). kind git means a git repository (defaultBranch given), folder means a plain directory. isWorkspace marks the managed organization workspace, which is the default issue source when sourceId is omitted; the issue location applies to every agent the issue is handed to.',
      input: { type: 'object' },
      execute: () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          return { items: await deps.issues.listSources(scope) };
        }),
    }),
    tool('label_list', {
      group: 'issues',
      description:
        'List issue labels used for dispatch (column rules match status+label to an agent).',
      input: { type: 'object' },
      execute: () =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          return { items: await deps.issues.listLabels(scope) };
        }),
    }),
    tool('label_create', {
      group: 'issues',
      description:
        'Create issue labels (unique title, optional color) for dispatch rules: one title or a labels batch. A batch applies one by one and reports { created, labels, failed }.',
      input: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          color: {
            type: 'string',
            description: `Optional: hex #RRGGBB or a palette name (${ENTITY_COLOR_NAMES.join(', ')}). Default gray.`,
          },
          labels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                color: { type: 'string' },
              },
              required: ['title'],
            },
          },
        },
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as LabelCreateToolInput;
          if (input.labels !== undefined) {
            if (input.title !== undefined) {
              throw new Error('Provide either title or labels, not both');
            }
            const outcome = await runBatch(
              input.labels,
              'labels',
              (entry) => deps.issues.createLabel(scope, { title: entry.title, color: entry.color }),
              (entry, error) => ({ title: entry.title, error }),
            );
            return { created: outcome.done, labels: outcome.items, failed: outcome.failed };
          }
          if (input.title === undefined) {
            throw new Error('Provide title or a labels array');
          }
          return await deps.issues.createLabel(scope, {
            title: input.title,
            color: input.color,
          });
        }),
    }),
    tool('board_create', {
      group: 'issues',
      description:
        'Create an issue board from a template (dev | simple | crm | blank). Name and optional description.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          color: { type: 'string' },
          icon: { type: 'string' },
          template: { type: 'string', enum: ['dev', 'simple', 'crm', 'blank'] },
        },
        required: ['name', 'template'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueBoardCreateInput;
          return await deps.issues.createBoard(scope, {
            name: input.name,
            template: input.template,
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.color !== undefined ? { color: input.color } : {}),
            ...(input.icon !== undefined ? { icon: input.icon } : {}),
          });
        }),
    }),
    tool('board_update', {
      group: 'issues',
      description: 'Edit board fields (name/description/color/icon).',
      input: {
        type: 'object',
        properties: {
          boardId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          color: { type: 'string' },
          icon: { type: 'string' },
        },
        required: ['boardId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as IssueBoardUpdateInput & { boardId: string };
          return await deps.issues.updateBoard(scope, input.boardId, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.color !== undefined ? { color: input.color } : {}),
            ...(input.icon !== undefined ? { icon: input.icon } : {}),
          });
        }),
    }),
    tool('label_delete', {
      group: 'issues',
      description:
        'Delete dispatch labels. Each is removed from all issues and column rules. This is irreversible: pass confirm=true. One labelId or a labelIds batch; a batch reports { deleted, failed }.',
      input: {
        type: 'object',
        properties: {
          labelId: { type: 'string' },
          labelIds: { type: 'array', items: { type: 'string' } },
          confirm: { type: 'boolean' },
        },
        required: ['confirm'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as LabelDeleteToolInput;
          if (!input.confirm) {
            throw new Error('label_delete requires confirm=true');
          }
          if (input.labelIds !== undefined) {
            if (input.labelId !== undefined) {
              throw new Error('Provide either labelId or labelIds, not both');
            }
            const outcome = await runBatch(
              input.labelIds,
              'labelIds',
              async (labelId) => {
                await deps.issues.deleteLabel(scope, labelId);
                return { deleted: true };
              },
              (labelId, error) => ({ labelId, error }),
            );
            return { deleted: outcome.done, failed: outcome.failed };
          }
          if (input.labelId === undefined) {
            throw new Error('Provide labelId or a labelIds array');
          }
          await deps.issues.deleteLabel(scope, input.labelId);
          return { deleted: true };
        }),
    }),
    tool('board_rule_save', {
      group: 'issues',
      description:
        'Create or update a board automation rule (trigger -> conditions -> actions). Omit ruleId to create a new rule (appended last); pass ruleId to update an existing rule of that board. position orders rules; when several matching rules assign an agent, the last one by position wins. List labels with label_list; list agents and statuses with issue_board_list.',
      input: {
        type: 'object',
        properties: {
          boardId: { type: 'string' },
          ruleId: { type: 'string', description: 'Pass to update an existing rule of this board.' },
          trigger: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['status_entered', 'issue_created'] },
              statusKey: { type: 'string', description: 'Required when type is status_entered.' },
            },
            required: ['type'],
          },
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['has_label'] },
                labelId: { type: 'string' },
              },
              required: ['type', 'labelId'],
            },
          },
          actions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['assign_agent', 'set_status', 'notify_owner'] },
                agentId: { type: 'string', description: 'Required for assign_agent.' },
                executionProfileId: { type: 'string' },
                statusKey: { type: 'string', description: 'Required for set_status.' },
                text: { type: 'string', description: 'Required for notify_owner.' },
              },
              required: ['type'],
            },
          },
          position: { type: 'number' },
          enabled: { type: 'boolean' },
        },
        required: ['boardId', 'trigger', 'actions'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as BoardRuleSaveInput;
          if (input.trigger.type === 'status_entered' && !input.trigger.statusKey) {
            throw new Error('trigger.statusKey is required when trigger.type is status_entered');
          }
          const boards = await deps.issues.listBoards(scope);
          const board = boards.find((item) => item.id === input.boardId);
          const existing = input.ruleId
            ? board?.rules.find((rule) => rule.id === input.ruleId)
            : undefined;
          const rule: BoardRuleInput = {
            trigger: input.trigger,
            conditions: input.conditions ?? [],
            actions: input.actions,
            position: input.position ?? existing?.position ?? board?.rules.length ?? 0,
            enabled: input.enabled ?? existing?.enabled ?? true,
          };
          return await deps.issues.saveBoardRule(scope, input.boardId, rule, input.ruleId);
        }),
    }),
    tool('board_rule_delete', {
      group: 'issues',
      description: 'Delete a board automation rule. This is irreversible: pass confirm=true.',
      input: {
        type: 'object',
        properties: {
          boardId: { type: 'string' },
          ruleId: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['boardId', 'ruleId', 'confirm'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as BoardRuleDeleteInput;
          if (!input.confirm) {
            throw new Error('board_rule_delete requires confirm=true');
          }
          await deps.issues.deleteBoardRule(scope, input.boardId, input.ruleId);
          return { deleted: true };
        }),
    }),
    tool('board_delete', {
      group: 'issues',
      description:
        'Delete a board together with all its issues. This is irreversible: pass confirm=true.',
      input: {
        type: 'object',
        properties: { boardId: { type: 'string' }, confirm: { type: 'boolean' } },
        required: ['boardId', 'confirm'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as { boardId: string; confirm: boolean };
          if (!input.confirm) {
            throw new Error('board_delete requires confirm=true');
          }
          await deps.issues.deleteBoard(scope, input.boardId);
          return { deleted: true };
        }),
    }),
  ];
}
