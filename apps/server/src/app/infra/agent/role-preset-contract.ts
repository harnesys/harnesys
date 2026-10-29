import type { AgentPresetBody } from '@harnesys/contracts';

type PermissionValue = 'allow' | 'ask' | 'deny';

interface RoleRule {
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  permissions: Record<string, PermissionValue>;
  maxSteps: number;
}

const JARVIS_RULE: RoleRule = {
  requiredCapabilities: ['issues', 'threads', 'manager', 'plan', 'pin-memory', 'core'],
  forbiddenCapabilities: ['files', 'shell', 'fetch', 'web'],
  permissions: { 'fs.write': 'deny', process: 'deny', network: 'deny', mcp: 'deny' },
  maxSteps: 40,
};

const CODER_RULE: RoleRule = {
  requiredCapabilities: ['files', 'shell', 'issues', 'lsp', 'plan', 'pin-memory', 'core'],
  forbiddenCapabilities: [],
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'ask', mcp: 'ask' },
  maxSteps: 300,
};

const REVIEWER_RULE: RoleRule = {
  requiredCapabilities: ['files', 'shell', 'issues', 'core'],
  forbiddenCapabilities: [],
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'deny', mcp: 'deny' },
  maxSteps: 120,
};

const ROLE_RULES: Record<string, RoleRule> = {
  'harnesys/jarvis': JARVIS_RULE,
  'harnesys/coder': CODER_RULE,
  'harnesys/reviewer': REVIEWER_RULE,
};

export function rolePresetContract(id: string, preset: AgentPresetBody): string[] {
  const rule = ROLE_RULES[id];
  if (!rule) {
    return [];
  }
  const violations: string[] = [];
  if (preset.instructions.trim().length === 0) {
    violations.push(`${id}: instructions must be non-empty`);
  }
  const capabilities = new Set(Object.keys(preset.capabilities ?? {}));
  for (const capability of rule.requiredCapabilities) {
    if (!capabilities.has(capability)) {
      violations.push(`${id}: missing capability ${capability}`);
    }
  }
  for (const capability of rule.forbiddenCapabilities) {
    if (capabilities.has(capability)) {
      violations.push(`${id}: forbidden capability ${capability}`);
    }
  }
  const permissions = preset.permissions ?? {};
  for (const [operation, expected] of Object.entries(rule.permissions)) {
    if (permissions[operation] !== expected) {
      violations.push(`${id}: permission ${operation} must be ${expected}`);
    }
  }
  if (preset.budget?.maxSteps !== rule.maxSteps) {
    violations.push(`${id}: maxSteps must be ${rule.maxSteps}`);
  }
  return violations;
}
