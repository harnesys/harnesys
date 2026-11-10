import type {
  AddonEvent,
  AddonGrantBody,
  AddonJobPatchBody,
  AddonJobView,
  AddonRollbackBody,
  AddonUpdateBody,
  LogLineListResponse,
  LogLineView,
  MetricsView,
  OrgAddonDetail,
  OrgAddonListResponse,
  TriggerInstanceUpsertBody,
  TriggerInstanceView,
} from '@harnesys/contracts';
import { AddonEventSchema, LogLineViewSchema } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
import { watchEventSource } from './sse';

export function addonsQueryKey(orgId: string) {
  return ['addons', orgId] as const;
}

export function orgAddonsQueryKey(orgId: string) {
  return [...addonsQueryKey(orgId), 'list'] as const;
}

export function orgAddonDetailQueryKey(orgId: string, addonId: string) {
  return [...addonsQueryKey(orgId), 'detail', addonId] as const;
}

function addonsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/addons`;
}

function addonBase(orgId: string, addonId: string) {
  return `${addonsBase(orgId)}/${encodeURIComponent(addonId)}`;
}

// --- Org add-ons -----------------------------------------------------------

export function orgAddonsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgAddonsQueryKey(orgId),
    queryFn: () => apiJson<OrgAddonListResponse>(addonsBase(orgId)),
    enabled: Boolean(orgId),
  });
}

export function orgAddonDetailQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: orgAddonDetailQueryKey(orgId, addonId),
    queryFn: () => apiJson<OrgAddonDetail>(addonBase(orgId, addonId)),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function getOrgAddon(orgId: string, addonId: string): Promise<OrgAddonDetail> {
  return apiJson<OrgAddonDetail>(addonBase(orgId, addonId));
}

export function enableOrgAddon(orgId: string, addonId: string, body: AddonGrantBody) {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/enable`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function disableOrgAddon(orgId: string, addonId: string) {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/disable`, { method: 'POST' });
}

export function updateOrgAddon(orgId: string, addonId: string, body: AddonUpdateBody) {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/update`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function rollbackOrgAddon(orgId: string, addonId: string, body: AddonRollbackBody) {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/rollback`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function putOrgAddonGrants(orgId: string, addonId: string, body: AddonGrantBody) {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/grants`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteOrgAddon(orgId: string, addonId: string, data: 'keep' | 'purge') {
  return apiJson<void>(`${addonBase(orgId, addonId)}?data=${data}`, { method: 'DELETE' });
}

export interface SetAddonConfigBody {
  values: Record<string, unknown>;
  secrets?: Record<string, string | null>;
}

export function putOrgAddonConfig(
  orgId: string,
  addonId: string,
  body: SetAddonConfigBody,
): Promise<OrgAddonDetail> {
  return apiJson<OrgAddonDetail>(`${addonBase(orgId, addonId)}/config`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function putOrgAddonBindings(
  orgId: string,
  addonId: string,
  connectionId: string,
  accountIds: string[],
) {
  return apiJson<OrgAddonDetail>(
    `${addonBase(orgId, addonId)}/bindings/${encodeURIComponent(connectionId)}`,
    { method: 'PUT', body: JSON.stringify({ accountIds }) },
  );
}

// --- Triggers ---------------------------------------------------------------

export function orgAddonTriggersQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: [...orgAddonDetailQueryKey(orgId, addonId), 'triggers'] as const,
    queryFn: () =>
      apiJson<{ items: TriggerInstanceView[] }>(`${addonBase(orgId, addonId)}/triggers`),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function createOrgAddonTrigger(
  orgId: string,
  addonId: string,
  body: TriggerInstanceUpsertBody,
): Promise<TriggerInstanceView> {
  return apiJson<TriggerInstanceView>(`${addonBase(orgId, addonId)}/triggers`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchOrgAddonTrigger(
  orgId: string,
  addonId: string,
  instanceId: string,
  body: TriggerInstanceUpsertBody,
): Promise<TriggerInstanceView> {
  return apiJson<TriggerInstanceView>(
    `${addonBase(orgId, addonId)}/triggers/${encodeURIComponent(instanceId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteOrgAddonTrigger(
  orgId: string,
  addonId: string,
  instanceId: string,
): Promise<void> {
  return apiJson<void>(`${addonBase(orgId, addonId)}/triggers/${encodeURIComponent(instanceId)}`, {
    method: 'DELETE',
  });
}

export function setOrgAddonTriggerEnabled(
  orgId: string,
  addonId: string,
  instanceId: string,
  enabled: boolean,
): Promise<void> {
  return apiJson<void>(
    `${addonBase(orgId, addonId)}/triggers/${encodeURIComponent(instanceId)}/${enabled ? 'enable' : 'disable'}`,
    { method: 'POST' },
  );
}

// --- Jobs -------------------------------------------------------------------

export function orgAddonJobsQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: [...orgAddonDetailQueryKey(orgId, addonId), 'jobs'] as const,
    queryFn: () => apiJson<{ items: AddonJobView[] }>(`${addonBase(orgId, addonId)}/jobs`),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function patchOrgAddonJob(
  orgId: string,
  addonId: string,
  jobId: string,
  body: AddonJobPatchBody,
): Promise<AddonJobView> {
  return apiJson<AddonJobView>(`${addonBase(orgId, addonId)}/jobs/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function runOrgAddonJob(orgId: string, addonId: string, jobId: string): Promise<void> {
  return apiJson<void>(`${addonBase(orgId, addonId)}/jobs/${encodeURIComponent(jobId)}/run`, {
    method: 'POST',
  });
}

// --- Runtime actions and diagnostics ---------------------------------------

export function restartOrgAddon(orgId: string, addonId: string): Promise<void> {
  return apiJson<void>(`${addonBase(orgId, addonId)}/restart`, { method: 'POST' });
}

export function resetOrgAddonQuarantine(orgId: string, addonId: string): Promise<void> {
  return apiJson<void>(`${addonBase(orgId, addonId)}/quarantine/reset`, { method: 'POST' });
}

export function orgAddonLogsQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: [...orgAddonDetailQueryKey(orgId, addonId), 'logs'] as const,
    queryFn: () => getOrgAddonLogs(orgId, addonId),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function getOrgAddonLogs(orgId: string, addonId: string): Promise<LogLineListResponse> {
  return apiJson<LogLineListResponse>(`${addonBase(orgId, addonId)}/logs`);
}

export function orgAddonMetricsQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: [...orgAddonDetailQueryKey(orgId, addonId), 'metrics'] as const,
    queryFn: () => apiJson<MetricsView>(`${addonBase(orgId, addonId)}/metrics`),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function orgAddonDataExportUrl(orgId: string, addonId: string): string {
  return `${addonBase(orgId, addonId)}/data/export`;
}

// --- Addon routes (RouteRef) --------------------------------------------------

const ADDON_ROUTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type AddonRouteMethod = (typeof ADDON_ROUTE_METHODS)[number];

export interface AddonRouteCallOptions {
  method?: AddonRouteMethod;
  body?: unknown;
}

export function orgAddonRouteUrl(
  orgId: string,
  addonId: string,
  route: string,
  params: Record<string, string> = {},
): string {
  const resolved = route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (name, key: string) => {
    return params[key] ?? name;
  });
  const suffix = resolved.startsWith('/') ? resolved : `/${resolved}`;
  return `${addonBase(orgId, addonId)}/r${suffix}`;
}

export function fetchAddonRoute(
  orgId: string,
  addonId: string,
  route: string,
  params: Record<string, string> = {},
  options: AddonRouteCallOptions = {},
): Promise<unknown> {
  const url = orgAddonRouteUrl(orgId, addonId, route, params);
  const query = new URLSearchParams(params).toString();
  const withQuery = options.method === 'GET' && query ? `${url}?${query}` : url;
  return apiJson<unknown>(withQuery, {
    method: options.method ?? 'GET',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

// --- SSE -----------------------------------------------------------------------

export interface WatchAddonEventsOptions {
  onEvent: (event: AddonEvent) => void;
  onError?: () => void;
}

export function watchAddonEvents(orgId: string, options: WatchAddonEventsOptions): () => void {
  const url = `${addonsBase(orgId)}/events`;
  const unsubs = ['addon.state_changed', 'addon.update_available', 'addon.consent_required'].map(
    (event) =>
      watchEventSource(
        url,
        event,
        (data) => {
          try {
            const parsed = AddonEventSchema.safeParse(JSON.parse(data));
            if (parsed.success) {
              options.onEvent(parsed.data);
            }
          } catch {
            return;
          }
        },
        { orgId, onError: options.onError },
      ),
  );
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export function watchAddonLogStream(
  orgId: string,
  addonId: string,
  onLine: (line: LogLineView) => void,
  onError?: () => void,
): () => void {
  const url = `${addonBase(orgId, addonId)}/logs/stream`;
  return watchEventSource(
    url,
    'log',
    (data) => {
      try {
        const parsed = LogLineViewSchema.safeParse(JSON.parse(data));
        if (parsed.success) {
          onLine(parsed.data);
        }
      } catch {
        return;
      }
    },
    { orgId, onError },
  );
}
