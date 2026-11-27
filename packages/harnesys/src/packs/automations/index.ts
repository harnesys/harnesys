import { definePack } from '../../domain/pack.ts';
import type { AutomationAdminPort } from '../../ports/automation-admin.ts';
import { createAutomationTools } from './tools.ts';

export interface AutomationsCapabilityPorts {
  automations: AutomationAdminPort;
}

export const automationsCapability = definePack<
  AutomationsCapabilityPorts,
  Record<string, unknown>
>({
  name: 'automations',
  version: '1.0.0',
  description:
    'Automations: automation_kind_list / automation_list / automation_get / automation_create / automation_update / automation_action / automation_set_enabled / automation_delete / automation_script_runs / automation_script_test',
  icon: 'zap',
  meta: {
    tools: [
      {
        name: 'automation_kind_list',
        description:
          'List trigger kinds provided by installed add-ons with their config fields, connection and actions.',
      },
      {
        name: 'automation_list',
        description: 'List trigger instances with label, status, target and scripts.',
      },
      {
        name: 'automation_get',
        description:
          'Read one trigger instance including its full target, pre/post scripts and published actions.',
      },
      {
        name: 'automation_create',
        description:
          'Create a trigger instance for any installed add-on kind, with optional workspace and pre/post scripts.',
      },
      {
        name: 'automation_update',
        description:
          'Update label, config, instructions, enabled state or target fields (workspace, scripts) of a trigger instance.',
      },
      {
        name: 'automation_action',
        description:
          'Invoke an add-on operation declared by the kind (status, test, deliveries, rotate_secret, and any other action).',
      },
      {
        name: 'automation_set_enabled',
        description: 'Pause or resume a trigger instance.',
      },
      {
        name: 'automation_delete',
        description: 'Delete a trigger instance permanently. Requires confirm=true.',
      },
      {
        name: 'automation_script_runs',
        description: 'Recent pre/post script runs with status, exit code, gate verdict and output.',
      },
      {
        name: 'automation_script_test',
        description:
          'Run a pre-script and gate in the instance workspace without firing the trigger.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createAutomationTools({
      automations: ctx.ports.automations,
      resolveScope: () => ctx.scope,
    }),
    notes: () => [
      {
        tag: 'automations',
        text:
          'Every add-on trigger is managed through the automation_* tools: list kinds with automation_kind_list, create with automation_create, inspect with automation_get, edit with automation_update. ' +
          'A trigger kind carries its own config fields; automation_kind_list returns them with type, required, options and help, so build config from that schema instead of guessing. ' +
          'Kind-specific operations (status, test, deliveries, rotate_secret, and any other) are declared as actions: discover them in automation_kind_list or automation_get and invoke them with automation_action. ' +
          'Pre/post scripts are part of the target: pass scripts to automation_create/automation_update, or update only the scripts by passing scripts to automation_update. ' +
          'A pre script with a gate is the way to build "fire only when there is work": the script runs before the fire limits and an unmatched gate or exit 2 suppresses the run. ' +
          'When the agent is not needed at all, set scripts.agent to "never" (the pre script is the whole job, the fire returns script-only) or "conditional" with an escalate rule (the agent starts only when the script fails or its gate passes, carrying the script diagnostics) so a healthy run costs no tokens. Debug with automation_script_runs and automation_script_test. ' +
          'Client-side polling is not a substitute for a trigger: arm a trigger and let the host fire it. ' +
          'When "automations" is listed in your available-skills catalog, load_skill { name: "automations" } carries the config field types, the gate matrix and the action table; when it is not listed, do not call it — the scripts parameter schema of automation_create and automation_update already documents the gate arms inline.',
      },
    ],
  }),
});
