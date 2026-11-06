import type {
  AutomationItem,
  AutomationKind,
  ListAutomationKindsResponse,
  ListAutomationsResponse,
} from '@harnesys/contracts';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';

function requireOrgId(orgId?: string): string {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    throw new ApiError(400, 'No active organization');
  }
  return resolved;
}

export function automationsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/automations`;
}

export function listAutomations(orgId?: string): Promise<AutomationItem[]> {
  const resolved = requireOrgId(orgId);
  return apiJson<ListAutomationsResponse>(automationsBase(resolved)).then((res) => res.items);
}

export function listAutomationKinds(orgId?: string): Promise<AutomationKind[]> {
  const resolved = requireOrgId(orgId);
  return apiJson<ListAutomationKindsResponse>(`${automationsBase(resolved)}/kinds`).then(
    (res) => res.items,
  );
}
