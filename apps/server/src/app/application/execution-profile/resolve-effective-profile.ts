import type { EffectiveProfile } from '@harnesys/contracts';

export interface ResolveEffectiveProfileInput {
  threadProfileId?: string | null;
  issueRuleProfileId?: string | null;
  agentProfileId?: string | null;
  orgDefaultProfileId: string;
}

export function resolveEffectiveProfile(input: ResolveEffectiveProfileInput): EffectiveProfile {
  if (input.threadProfileId) {
    return { profileId: input.threadProfileId, selectedBy: 'thread' };
  }
  if (input.issueRuleProfileId) {
    return { profileId: input.issueRuleProfileId, selectedBy: 'issue-rule' };
  }
  if (input.agentProfileId) {
    return { profileId: input.agentProfileId, selectedBy: 'agent' };
  }
  return { profileId: input.orgDefaultProfileId, selectedBy: 'organization' };
}
