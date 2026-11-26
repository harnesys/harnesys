import type { JsonSchema } from '../../domain/json-schema.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { AutomationAdminPort } from '../../ports/automation-admin.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runGuard } from '../issues/run-guard.ts';
import { createAutomationActionTool } from './action-tool.ts';
import { createScriptTools } from './script-tools.ts';

export interface AutomationToolsDeps {
  automations: AutomationAdminPort;
  resolveScope: () => CapabilityScope;
}

const SCRIPTS_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Pre/post scripts with an optional gate. Shape: { pre?: { script, gate?, onError?: skip-run|run-with-note|ignore, injectStdout?, onWorkspaceMissing?: skip-run|fail }, post?: { script, when?: always|success|failure } }. A pre script runs before the fire limits and can suppress the run (exit 2, unmatched gate, or a failed command under skip-run). A post script runs after the run reaches a terminal status. acknowledged is set to true automatically.',
  properties: {
    acknowledged: { type: 'boolean' },
    pre: { type: 'object' },
    post: { type: 'object' },
  },
};

const WORKSPACE_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Workspace binding: { kind: inherit | sandbox | folder { path } | source { sourceId, subpath? } | worktree { sourceId, worktreeId, subpath? } }. Applies to the target thread.',
};

interface TargetFields {
  threadId?: string;
  agentId?: string;
  modeId?: string;
  workspace?: Record<string, unknown>;
  scripts?: Record<string, unknown>;
}

interface CreateInput extends TargetFields {
  addonId: string;
  kind: string;
  label: string;
  config?: Record<string, unknown>;
  instructions?: string;
  enabled?: boolean;
}

interface UpdateInput extends TargetFields {
  instanceId: string;
  label?: string;
  config?: Record<string, unknown>;
  instructions?: string;
  enabled?: boolean;
}

interface EnabledInput {
  instanceId: string;
  enabled: boolean;
}

interface DeleteInput {
  instanceId: string;
  confirm?: boolean;
}

function scriptsOf(scripts: Record<string, unknown>): Record<string, unknown> {
  return scripts.pre === undefined && scripts.post === undefined
    ? {}
    : { ...scripts, acknowledged: true };
}

function targetOf(input: TargetFields, scope: CapabilityScope): Record<string, unknown> {
  const target: Record<string, unknown> = {
    threadId: input.threadId ?? scope.threadId,
    agentId: input.agentId ?? scope.agentId,
  };
  if (input.modeId !== undefined) {
    target.modeId = input.modeId;
  }
  if (input.workspace !== undefined) {
    target.workspace = input.workspace;
  }
  if (input.scripts !== undefined) {
    target.scripts = scriptsOf(input.scripts);
  }
  return target;
}

function targetPatchOf(input: TargetFields): Record<string, unknown> | undefined {
  const patch: Record<string, unknown> = {};
  if (input.threadId !== undefined) {
    patch.threadId = input.threadId;
  }
  if (input.agentId !== undefined) {
    patch.agentId = input.agentId;
  }
  if (input.modeId !== undefined) {
    patch.modeId = input.modeId;
  }
  if (input.workspace !== undefined) {
    patch.workspace = input.workspace;
  }
  if (input.scripts !== undefined) {
    patch.scripts = scriptsOf(input.scripts);
  }
  return Object.keys(patch).length === 0 ? undefined : patch;
}

export function createAutomationTools(deps: AutomationToolsDeps): ToolDefinition[] {
  return [
    tool('automation_kind_list', {
      group: 'automations',
      description:
        'List trigger kinds provided by installed add-ons (addonId, kind, title, configFields, connection, limits, actions). Use it before automation_create to learn the config fields a kind expects and the actions it publishes. Pass addonId to narrow the list.',
      input: {
        type: 'object',
        properties: { addonId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const addonId = (raw as { addonId?: string }).addonId;
          const items = deps.automations.listKinds(deps.resolveScope().orgId);
          return {
            items: addonId === undefined ? items : items.filter((k) => k.addonId === addonId),
          };
        }),
    }),
    tool('automation_list', {
      group: 'automations',
      description:
        'List trigger instances in the organization: instanceId, addonId, kind, label, enabled, instructions, config and target (thread, agent, workspace, scripts).',
      input: { type: 'object' },
      execute: () =>
        runGuard(async () => ({ items: deps.automations.list(deps.resolveScope().orgId) })),
    }),
    tool('automation_get', {
      group: 'automations',
      description:
        'Read one trigger instance with its full target, including pre/post scripts and their gate, plus the actions its kind publishes.',
      input: {
        type: 'object',
        properties: { instanceId: { type: 'string', minLength: 1 } },
        required: ['instanceId'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const scope = deps.resolveScope();
          const instance = deps.automations.get(
            scope.orgId,
            (raw as { instanceId: string }).instanceId,
          );
          if (!instance) {
            return { error: 'trigger instance not found' };
          }
          return { instance };
        }),
    }),
    tool('automation_create', {
      group: 'automations',
      description:
        'Create a trigger instance for any installed add-on kind. Defaults threadId/agentId to the calling thread and agent; one instance per thread is allowed, so create a dedicated thread first or pass threadId. Any workspace or scripts field is validated by the host. Non-empty scripts are acknowledged automatically.',
      input: {
        type: 'object',
        properties: {
          addonId: { type: 'string', minLength: 1 },
          kind: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          config: { type: 'object' },
          instructions: { type: 'string' },
          threadId: { type: 'string' },
          agentId: { type: 'string' },
          modeId: { type: 'string' },
          workspace: WORKSPACE_SCHEMA,
          scripts: SCRIPTS_SCHEMA,
          enabled: { type: 'boolean' },
        },
        required: ['addonId', 'kind', 'label'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as CreateInput;
          const scope = deps.resolveScope();
          const instance = await deps.automations.create(scope.orgId, {
            addonId: input.addonId,
            kind: input.kind,
            label: input.label,
            target: targetOf(input, scope),
            ...(input.config === undefined ? {} : { config: input.config }),
            ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          });
          return { instance };
        }),
    }),
    tool('automation_update', {
      group: 'automations',
      description:
        'Update a trigger instance: label, config, instructions, enabled, or target fields (threadId/agentId/modeId/workspace/scripts). Target fields are merged into the stored target, so passing scripts alone changes only the scripts. Pass scripts: {} to clear pre/post scripts.',
      input: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          config: { type: 'object' },
          instructions: { type: 'string' },
          enabled: { type: 'boolean' },
          threadId: { type: 'string' },
          agentId: { type: 'string' },
          modeId: { type: 'string' },
          workspace: WORKSPACE_SCHEMA,
          scripts: SCRIPTS_SCHEMA,
        },
        required: ['instanceId'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as UpdateInput;
          const target = targetPatchOf(input);
          const instance = await deps.automations.update(deps.resolveScope().orgId, {
            instanceId: input.instanceId,
            ...(input.label === undefined ? {} : { label: input.label }),
            ...(input.config === undefined ? {} : { config: input.config }),
            ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
            ...(target === undefined ? {} : { target }),
          });
          return { instance };
        }),
    }),
    createAutomationActionTool(deps),
    tool('automation_set_enabled', {
      group: 'automations',
      description:
        'Pause or resume a trigger instance. A paused instance keeps its config, target and scripts and fires nothing until resumed.',
      input: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          enabled: { type: 'boolean' },
        },
        required: ['instanceId', 'enabled'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as EnabledInput;
          await deps.automations.setEnabled(
            deps.resolveScope().orgId,
            input.instanceId,
            input.enabled,
          );
          return { ok: true, instanceId: input.instanceId, enabled: input.enabled };
        }),
    }),
    tool('automation_delete', {
      group: 'automations',
      description:
        'Delete a trigger instance permanently. Requires confirm=true. Prefer automation_set_enabled for a reversible pause.',
      input: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          confirm: { type: 'boolean' },
        },
        required: ['instanceId'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as DeleteInput;
          if (!input.confirm) {
            return { error: 'confirm=true is required to delete a trigger instance' };
          }
          await deps.automations.remove(deps.resolveScope().orgId, input.instanceId);
          return { ok: true, instanceId: input.instanceId, deleted: true };
        }),
    }),
    ...createScriptTools(deps),
  ];
}
