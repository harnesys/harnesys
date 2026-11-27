import { describe, expect, test } from 'bun:test';
import type { AgentDefinition, AgentPacks } from 'harnesys';
import type { ShellRulePatterns } from '../../domain/permissions/permission-rule-store.port.ts';
import { applyShellRulePatterns } from './org-runtime-permission-rules.ts';

const patterns: ShellRulePatterns = { allow: ['ls *'], deny: ['rm *'] };

function defWithPacks(packs: AgentPacks): AgentDefinition {
  return {
    id: 'a-1',
    prompts: {},
    graph: {
      nodes: { start: { type: 'core:start' }, end: { type: 'core:end' } },
      edges: [{ from: 'start', to: 'end' }],
    },
    packs,
  };
}

describe('applyShellRulePatterns', () => {
  test('durable rules never grant the shell pack to an agent that does not have it', () => {
    const def = defWithPacks({ files: { disabledTools: ['write_file'] } });
    const result = applyShellRulePatterns(def, patterns);
    expect(result.packs).toEqual({ files: { disabledTools: ['write_file'] } });
    expect(result.packs?.shell).toBeUndefined();
  });

  test('an explicitly disabled shell pack stays disabled', () => {
    const def = defWithPacks({ files: true, shell: false });
    const result = applyShellRulePatterns(def, patterns);
    expect(result.packs?.shell).toBe(false);
  });

  test('an enabled shell pack gets the durable spec while its trims survive', () => {
    const def = defWithPacks({ shell: { disabledTools: ['remote_copy'], spec: { timeout: 30 } } });
    const result = applyShellRulePatterns(def, patterns);
    expect(result.packs?.shell).toEqual({
      disabledTools: ['remote_copy'],
      spec: { timeout: 30, allowlist: ['ls *'], blocklist: ['rm *'] },
    });
  });

  test('a boolean shell assignment becomes an object assignment with the rules', () => {
    const def = defWithPacks({ shell: true });
    const result = applyShellRulePatterns(def, patterns);
    expect(result.packs?.shell).toEqual({ spec: { allowlist: ['ls *'], blocklist: ['rm *'] } });
  });
});
