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
import { runGuard } from './run-guard.ts';
export interface CreateIssueMetaToolsParams {
  issues: IssueTrackerPort;
  resolveScope: () => CapabilityScope;
}
interface LabelCreateInput {
  title: string;
  color?: string;
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
        'List sources an issue can bind to for its runs (issue_create/issue_update sourceId). kind git means a git repository (defaultBranch given), folder means a plain directory. isWorkspace marks the managed workspace source used when an issue has no explicit source.',
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
      description: 'Create an issue label (unique title, optional color) for dispatch rules.',
      input: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          color: {
            type: 'string',
            description: `Optional: hex #RRGGBB or a palette name (${ENTITY_COLOR_NAMES.join(', ')}). Default gray.`,
          },
        },
        required: ['title'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as LabelCreateInput;
          return await deps.issues.createLabel(scope, { title: input.title, color: input.color });
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
        'Delete a dispatch label. It is removed from all issues and column rules. This is irreversible: pass confirm=true.',
      input: {
        type: 'object',
        properties: { labelId: { type: 'string' }, confirm: { type: 'boolean' } },
        required: ['labelId', 'confirm'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const input = raw as { labelId: string; confirm: boolean };
          if (!input.confirm) {
            throw new Error('label_delete requires confirm=true');
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
