import { describe, expect, test } from 'bun:test';
import type { AgentPresetBody } from '@harnesys/contracts';
import { rolePresetContract } from './role-preset-contract.ts';

function fixture(overrides: Partial<AgentPresetBody> = {}): AgentPresetBody {
  return {
    name: 'Fixture',
    role: 'generic',
    instructions: 'irrelevant',
    ...overrides,
  };
}

const CODER_OK: Partial<AgentPresetBody> = {
  role: 'coder',
  budget: { maxSteps: 300 },
  capabilities: {
    files: {},
    shell: { spec: { blocklist: ['git push *'] } },
    issues: {},
    lsp: {},
    plan: {},
    'pin-memory': {},
    core: {},
  },
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'ask', mcp: 'ask' },
};

const REVIEWER_OK: Partial<AgentPresetBody> = {
  role: 'reviewer',
  budget: { maxSteps: 120 },
  capabilities: {
    files: {},
    shell: { spec: { blocklist: ['git push --force'] } },
    issues: {},
    core: {},
  },
  permissions: { 'fs.write': 'allow', process: 'allow', network: 'deny', mcp: 'deny' },
};

describe('rolePresetContract', () => {
  test('accepts compliant role presets', () => {
    expect(rolePresetContract('harnesys/coder', fixture(CODER_OK))).toEqual([]);
    expect(rolePresetContract('harnesys/reviewer', fixture(REVIEWER_OK))).toEqual([]);
  });

  test('non-role presets have no contract', () => {
    expect(rolePresetContract('harnesys/assistant', fixture())).toEqual([]);
  });

  test('flags missing required capability', () => {
    const broken = fixture({
      ...CODER_OK,
      capabilities: { files: {}, shell: {}, issues: {} },
    });
    expect(rolePresetContract('harnesys/coder', broken)).toContain(
      'harnesys/coder: missing capability lsp',
    );
  });

  test('flags wrong permission value', () => {
    const broken = fixture({
      ...CODER_OK,
      permissions: { ...CODER_OK.permissions, 'fs.write': 'ask' },
    });
    expect(rolePresetContract('harnesys/coder', broken)).toContain(
      'harnesys/coder: permission fs.write must be allow',
    );
  });

  test('flags missing permission key', () => {
    const broken = fixture({
      ...REVIEWER_OK,
      permissions: { 'fs.write': 'allow', process: 'allow', mcp: 'deny' },
    });
    expect(rolePresetContract('harnesys/reviewer', broken)).toContain(
      'harnesys/reviewer: permission network must be deny',
    );
  });

  test('flags wrong maxSteps', () => {
    const broken = fixture({ ...REVIEWER_OK, budget: { maxSteps: 400 } });
    expect(rolePresetContract('harnesys/reviewer', broken)).toContain(
      'harnesys/reviewer: maxSteps must be 120',
    );
  });

  test('flags missing budget', () => {
    const broken = fixture({ ...CODER_OK, budget: undefined });
    expect(rolePresetContract('harnesys/coder', broken)).toContain(
      'harnesys/coder: maxSteps must be 300',
    );
  });

  test('flags empty instructions', () => {
    const broken = fixture({ ...REVIEWER_OK, instructions: '   ' });
    expect(rolePresetContract('harnesys/reviewer', broken)).toContain(
      'harnesys/reviewer: instructions must be non-empty',
    );
  });
});
