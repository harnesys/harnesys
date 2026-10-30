import type {
  AgentPresetBody,
  AgentPresetDetail,
  TeamPresetBody,
  TeamPresetDetail,
} from '@harnesys/contracts';
import { BOARD_TEMPLATES } from '@harnesys/contracts';

export const LEAD_BODY: AgentPresetBody = {
  name: 'Lead',
  role: 'manager',
  instructions: 'Coordinate the team.',
  budget: { maxSteps: 40 },
  capabilities: { issues: {}, threads: {}, manager: {}, plan: {}, 'pin-memory': {}, core: {} },
  permissions: { 'fs.write': 'deny', process: 'deny', network: 'deny', mcp: 'deny' },
};

export const CODER_BODY: AgentPresetBody = {
  name: 'Coder',
  role: 'coder',
  instructions: 'Write code.',
  budget: { maxSteps: 300 },
  capabilities: {
    files: {},
    shell: {},
    issues: {},
    lsp: {},
    plan: {},
    'pin-memory': {},
    core: {},
  },
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'ask', mcp: 'ask' },
};

export const REVIEWER_BODY: AgentPresetBody = {
  name: 'Reviewer',
  role: 'reviewer',
  instructions: 'Review code.',
  budget: { maxSteps: 120 },
  capabilities: { files: {}, shell: {}, issues: {}, core: {} },
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'deny', mcp: 'deny' },
};

export const TEAM_BODY: TeamPresetBody = {
  roles: [
    {
      roleKey: 'lead',
      name: 'Lead',
      agentRef: 'harnesys/lead',
      budgetUsdDaily: 5,
      requiresModel: true,
      capabilitiesExtra: ['manager'],
    },
    {
      roleKey: 'coder',
      name: 'Coder',
      agentRef: 'harnesys/coder',
      budgetUsdDaily: 10,
      requiresModel: true,
    },
    {
      roleKey: 'reviewer',
      name: 'Reviewer',
      agentRef: 'harnesys/reviewer',
      budgetUsdDaily: 5,
      requiresModel: true,
    },
  ],
  board: {
    name: 'Dev Team',
    statuses: BOARD_TEMPLATES.dev.statuses,
    rules: [
      {
        trigger: { type: 'status_entered', statusKey: 'in_progress' },
        conditions: [],
        actions: [{ type: 'assign_agent', roleKey: 'coder' }],
        position: 0,
        enabled: true,
      },
      {
        trigger: { type: 'status_entered', statusKey: 'in_review' },
        conditions: [],
        actions: [{ type: 'assign_agent', roleKey: 'reviewer' }],
        position: 1,
        enabled: true,
      },
    ],
  },
  digest: { cronDefault: '0 9 * * *', roleKey: 'lead', detail: 'Daily digest.' },
};

export function agentDetail(id: string, body: AgentPresetBody): AgentPresetDetail {
  return {
    kind: 'agent',
    id,
    origin: 'system',
    version: '1.0.0',
    name: body.name,
    tags: [],
    role: body.role,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    body,
  };
}

export function teamDetail(id: string, body: TeamPresetBody): TeamPresetDetail {
  return {
    kind: 'team',
    id,
    origin: 'system',
    version: '1.0.0',
    name: 'Dev Team',
    tags: [],
    roles: body.roles.map((role) => ({ roleKey: role.roleKey, name: role.name })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    body,
  };
}
