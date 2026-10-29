import type { AgentCapabilitiesView } from '@harnesys/contracts';
import { getActiveOrgId } from './active-org';
import {
  getOrgAgentCapabilities,
  orgAgentCapabilitiesQuery,
  orgAgentCapabilitiesQueryKey,
} from './org-capabilities';

export type { AgentCapabilitiesView };

export function agentCapabilitiesQueryKey(agentId: string, orgId = '') {
  const resolved = orgId || getActiveOrgId() || '';
  return orgAgentCapabilitiesQueryKey(resolved, agentId);
}

export function getAgentCapabilities(agentId: string, orgId?: string) {
  const resolved = orgId || getActiveOrgId();
  if (!resolved) {
    return Promise.reject(new Error('active org required'));
  }
  return getOrgAgentCapabilities(resolved, agentId);
}

export function agentCapabilitiesQuery(agentId: string | null, orgId = '') {
  const resolved = orgId || getActiveOrgId() || '';
  return orgAgentCapabilitiesQuery(resolved, agentId);
}

export { orgAgentCapabilitiesQuery, orgAgentCapabilitiesQueryKey };
