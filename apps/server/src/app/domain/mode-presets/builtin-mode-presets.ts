import type { ModeOpPermissions, PackAssignmentBody } from '@harnesys/contracts';

export interface BuiltinModePresetSeed {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignmentBody>;
  permissions?: ModeOpPermissions;
  installedByDefault: boolean;
  builtin: true;
}

const PLAN_INSTRUCTIONS = `Plan mechanics of the plan pack in this mode: this mode only plans. Nothing may be executed or written until the human approves the plan.

## Hard rule

In this mode you never execute the work the plan describes: no code edits, no project mutations, no commits, no side-effectful shell. Read-only work is always allowed.
Any write — the artifact file and plan_save included — is allowed only after the human approves the current draft.

## Phase 1 — Draft

Explore, present the plan as a chat message (Goal, Approach, File structure, Tasks, Risks), then STOP.

## Phase 2 — Materialize (only after explicit approval)

Write the plan artifact and call plan_save, then stop — do not begin implementing in the same run.
`;

export function builtinModePresetSeed(): BuiltinModePresetSeed[] {
  return [
    {
      id: 'ask',
      name: 'Ask before changes',
      description: 'Confirm every write or command.',
      permissions: {
        'fs.write': 'ask',
        process: 'ask',
        network: 'ask',
        mcp: 'ask',
        agents: 'ask',
      },
      installedByDefault: true,
      builtin: true,
    },
    {
      id: 'auto',
      name: 'Edit',
      description: 'File edits run without confirmation.',
      permissions: {
        'fs.write': 'allow',
        process: 'ask',
        network: 'ask',
        mcp: 'ask',
        agents: 'ask',
      },
      installedByDefault: true,
      builtin: true,
    },
    {
      id: 'plan',
      name: 'Plan',
      description: 'Task planning with the plan pack; writes and shell denied.',
      instructions: PLAN_INSTRUCTIONS,
      skills: ['superpowers:writing-plans'],
      packs: { plan: {} },
      permissions: {
        'fs.write': 'deny',
        process: 'deny',
        network: 'allow',
        mcp: 'allow',
        agents: 'deny',
      },
      installedByDefault: true,
      builtin: true,
    },
    {
      id: 'bypass',
      name: 'Bypass',
      description: 'Run everything without confirmations.',
      permissions: {
        'fs.write': 'allow',
        process: 'allow',
        network: 'allow',
        mcp: 'allow',
        agents: 'allow',
      },
      installedByDefault: false,
      builtin: true,
    },
    {
      id: 'dont_ask',
      name: "Don't ask",
      description: 'Writes auto-run; network and MCP denied.',
      permissions: {
        'fs.write': 'allow',
        process: 'deny',
        network: 'deny',
        mcp: 'deny',
        agents: 'deny',
      },
      installedByDefault: false,
      builtin: true,
    },
  ];
}
