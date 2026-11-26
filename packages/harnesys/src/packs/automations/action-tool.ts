import type { CapabilityScope } from '../../domain/pack.ts';
import type { AutomationAdminPort } from '../../ports/automation-admin.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runGuard } from '../issues/run-guard.ts';

export interface AutomationActionToolDeps {
  automations: AutomationAdminPort;
  resolveScope: () => CapabilityScope;
}

interface ActionInput {
  instanceId: string;
  action: string;
  input?: Record<string, unknown>;
}

export function createAutomationActionTool(deps: AutomationActionToolDeps): ToolDefinition {
  return tool('automation_action', {
    group: 'automations',
    description:
      'Invoke an add-on operation declared by the trigger kind: status, test, deliveries, rotate_secret, rotate_url, validate and any other action the kind publishes. Discover actions with automation_kind_list or automation_get; each action may declare an input schema, validated by the host before the call. Use this instead of add-on-specific trigger tools.',
    input: {
      type: 'object',
      properties: {
        instanceId: { type: 'string', minLength: 1 },
        action: { type: 'string', minLength: 1 },
        input: { type: 'object' },
      },
      required: ['instanceId', 'action'],
      additionalProperties: false,
    },
    execute: (raw) =>
      runGuard(async () => {
        const input = raw as ActionInput;
        const result = await deps.automations.action(
          deps.resolveScope().orgId,
          input.instanceId,
          input.action,
          input.input,
        );
        return { action: input.action, result };
      }),
  });
}
