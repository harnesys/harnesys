import type { JsonSchema } from '../../domain/json-schema.ts';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { AutomationAdminPort } from '../../ports/automation-admin.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { runGuard } from '../issues/run-guard.ts';
import { GATE_ARMS_SHAPE } from './gate-shape.ts';

export interface ScriptToolsDeps {
  automations: AutomationAdminPort;
  resolveScope: () => CapabilityScope;
}

const SCRIPT_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Shell command block: { command, args?, shell?: bash|zsh|sh|powershell, timeoutS?: 1..600, env? }. Runs on the host in the workspace of the target thread.',
  properties: {
    command: { type: 'string', minLength: 1 },
    args: { type: 'array', items: { type: 'string' } },
    shell: { type: 'string', enum: ['bash', 'zsh', 'sh', 'powershell'] },
    timeoutS: { type: 'integer', minimum: 1, maximum: 600 },
    env: { type: 'object' },
  },
  required: ['command'],
};

interface RunsInput {
  instanceId: string;
  limit?: number;
}

interface TestInput {
  instanceId: string;
  script: Record<string, unknown>;
  gate?: Record<string, unknown>;
}

export function createScriptTools(deps: ScriptToolsDeps): ToolDefinition[] {
  return [
    tool('automation_script_runs', {
      group: 'automations',
      description:
        'Recent pre/post script runs of an instance: stage, status, exit code, duration, cwd, gate verdict, summary and output tails. Use it to debug why a gate suppressed a fire.',
      input: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['instanceId'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as RunsInput;
          return deps.automations.scriptRuns(
            deps.resolveScope().orgId,
            input.instanceId,
            input.limit ?? 20,
          );
        }),
    }),
    tool('automation_script_test', {
      group: 'automations',
      description:
        'Run a pre-script (and optional gate) in the instance workspace without firing the trigger: returns status, exit code, duration, cwd, gate verdict and output. Never creates a run or an audit row.',
      input: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', minLength: 1 },
          script: SCRIPT_SCHEMA,
          gate: {
            type: 'object',
            description:
              'Gate evaluated against the script result, one arm: ' +
              GATE_ARMS_SHAPE +
              '. The verdict comes back as gateVerdict: passed|unmatched|not-applied.',
          },
        },
        required: ['instanceId', 'script'],
        additionalProperties: false,
      },
      execute: (raw) =>
        runGuard(async () => {
          const input = raw as TestInput;
          return deps.automations.testScript(deps.resolveScope().orgId, input.instanceId, {
            script: input.script,
            ...(input.gate === undefined ? {} : { gate: input.gate }),
          });
        }),
    }),
  ];
}
