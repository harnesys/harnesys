import { describe, expect, test } from 'bun:test';
import { StubFileRules, StubMachineConfig } from './approval-fakes.ts';
import { denyFileRuleOf, persistFileRule } from './persist-file-rule.ts';

describe('persistFileRule', () => {
  test('defaults to the canonical path on this host and honors a global target', () => {
    const fileRules = new StubFileRules();
    const deps = { fileRules, machineConfig: new StubMachineConfig() };
    persistFileRule(deps, {
      orgId: 'org-1',
      agentId: 'agent-1',
      rule: { kind: 'file-path', target: 'agent', effect: 'allow' },
      requestedPath: '/w/keep.ts',
      action: 'edit',
    });
    persistFileRule(deps, {
      orgId: 'org-1',
      agentId: 'agent-1',
      rule: { kind: 'file-path', target: 'global', effect: 'deny', hostId: 'host-9' },
      requestedPath: '/w/block.ts',
      action: 'read',
    });
    const commandRule = denyFileRuleOf({ kind: 'exact', pattern: 'git status', target: 'agent' });
    expect(fileRules.inserted).toEqual([
      {
        orgId: 'org-1',
        agentId: 'agent-1',
        hostId: 'host-1',
        pathPattern: '/w/keep.ts',
        action: 'edit',
        effect: 'allow',
      },
      {
        orgId: 'org-1',
        agentId: null,
        hostId: 'host-9',
        pathPattern: '/w/block.ts',
        action: 'read',
        effect: 'deny',
      },
    ]);
    expect(commandRule).toEqual({ kind: 'file-path', target: 'agent', effect: 'deny' });
  });
});
