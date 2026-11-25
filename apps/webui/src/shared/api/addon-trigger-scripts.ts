import type {
  TriggerScriptRunList,
  TriggerScriptTestRequest,
  TriggerScriptTestResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { addonBase, orgAddonDetailQueryKey } from './addons';
import { apiJson } from './client';

export function orgAddonTriggerScriptRunsQuery(orgId: string, addonId: string, instanceId: string) {
  return queryOptions({
    queryKey: [
      ...orgAddonDetailQueryKey(orgId, addonId),
      'triggers',
      instanceId,
      'script-runs',
    ] as const,
    queryFn: () =>
      apiJson<TriggerScriptRunList>(
        `${addonBase(orgId, addonId)}/triggers/${encodeURIComponent(instanceId)}/script-runs`,
      ),
    enabled: Boolean(orgId) && Boolean(addonId) && Boolean(instanceId),
  });
}

export function testOrgAddonTriggerScript(
  orgId: string,
  addonId: string,
  instanceId: string,
  body: TriggerScriptTestRequest,
): Promise<TriggerScriptTestResponse> {
  return apiJson<TriggerScriptTestResponse>(
    `${addonBase(orgId, addonId)}/triggers/${encodeURIComponent(instanceId)}/scripts/test`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
