import { describe, expect, test } from 'bun:test';
import { resolveEffectiveProfile } from './resolve-effective-profile.ts';

describe('resolveEffectiveProfile', () => {
  test('uses issue rule override first', () => {
    const result = resolveEffectiveProfile({
      issueRuleProfileId: 'rule-profile',
      agentProfileId: 'agent-profile',
      orgDefaultProfileId: 'org-profile',
    });
    expect(result).toEqual({ profileId: 'rule-profile', selectedBy: 'issue-rule' });
  });

  test('falls back to agent profile when no issue rule', () => {
    const result = resolveEffectiveProfile({
      issueRuleProfileId: null,
      agentProfileId: 'agent-profile',
      orgDefaultProfileId: 'org-profile',
    });
    expect(result).toEqual({ profileId: 'agent-profile', selectedBy: 'agent' });
  });

  test('falls back to org default when no agent profile', () => {
    const result = resolveEffectiveProfile({
      issueRuleProfileId: null,
      agentProfileId: null,
      orgDefaultProfileId: 'org-profile',
    });
    expect(result).toEqual({ profileId: 'org-profile', selectedBy: 'organization' });
  });

  test('empty string issue rule is treated as absent', () => {
    const result = resolveEffectiveProfile({
      issueRuleProfileId: '',
      agentProfileId: 'agent-profile',
      orgDefaultProfileId: 'org-profile',
    });
    expect(result).toEqual({ profileId: 'agent-profile', selectedBy: 'agent' });
  });
});
