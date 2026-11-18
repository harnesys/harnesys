import type {
  CreateDashboardBody,
  DashboardDetail,
  DashboardListResponse,
  DashboardSummary,
  DashboardWidget,
  JsonValue,
  UpdateDashboardBody,
  UpdateLayoutBody,
  UpdateWidgetBody,
  WidgetSource,
} from '@harnesys/contracts';
import { ApiError, apiJson } from './client';

/** Frame published on the `dashboards.changed` SSE event. */
export interface DashboardsChangedFrame {
  orgId?: string;
  dashboardId?: string;
  reason?: string;
  widgetId?: string;
  state?: Record<string, JsonValue>;
}

export function dashboardsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/dashboards`;
}

function dashboardUrl(orgId: string, dashboardId: string): string {
  return `${dashboardsBase(orgId)}/${encodeURIComponent(dashboardId)}`;
}

export async function listDashboards(orgId: string): Promise<DashboardSummary[]> {
  const res = await apiJson<DashboardListResponse>(dashboardsBase(orgId));
  return res.items;
}

export function getDashboard(orgId: string, dashboardId: string): Promise<DashboardDetail> {
  return apiJson<DashboardDetail>(dashboardUrl(orgId, dashboardId));
}

export function createDashboard(orgId: string, body: CreateDashboardBody): Promise<{ id: string }> {
  return apiJson<{ id: string }>(dashboardsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDashboard(
  orgId: string,
  dashboardId: string,
  body: UpdateDashboardBody,
): Promise<DashboardDetail> {
  return apiJson<DashboardDetail>(dashboardUrl(orgId, dashboardId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteDashboard(orgId: string, dashboardId: string): Promise<void> {
  return apiJson<void>(dashboardUrl(orgId, dashboardId), { method: 'DELETE' });
}

export function updateDashboardLayout(
  orgId: string,
  dashboardId: string,
  body: UpdateLayoutBody,
): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`${dashboardUrl(orgId, dashboardId)}/layout`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function addDashboardWidget(
  orgId: string,
  dashboardId: string,
  body: UpdateWidgetBody,
): Promise<{ widgetId: string }> {
  return apiJson<{ widgetId: string }>(`${dashboardUrl(orgId, dashboardId)}/widgets`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDashboardWidget(
  orgId: string,
  dashboardId: string,
  widgetId: string,
  body: UpdateWidgetBody,
): Promise<DashboardWidget> {
  return apiJson<DashboardWidget>(
    `${dashboardUrl(orgId, dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function deleteDashboardWidget(
  orgId: string,
  dashboardId: string,
  widgetId: string,
): Promise<void> {
  return apiJson<void>(
    `${dashboardUrl(orgId, dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
    { method: 'DELETE' },
  );
}

export function activateDashboardWidget(
  orgId: string,
  dashboardId: string,
  widgetId: string,
): Promise<DashboardWidget> {
  return apiJson<DashboardWidget>(
    `${dashboardUrl(orgId, dashboardId)}/widgets/${encodeURIComponent(widgetId)}/activate`,
    { method: 'POST' },
  );
}

export interface WidgetSourceTestOutcome {
  ok: boolean;
  status?: number;
  json?: unknown;
  error?: string;
}

/** Dry-run a source definition (editor probe) without persisting the widget. */
export function testWidgetSource(
  orgId: string,
  source: WidgetSource,
): Promise<WidgetSourceTestOutcome> {
  return apiJson<WidgetSourceTestOutcome>(`${dashboardsBase(orgId)}/source-test`, {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
}

export function parseDashboardsChangedFrame(data: string): DashboardsChangedFrame | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const frame: DashboardsChangedFrame = {};
    if (typeof record.orgId === 'string') {
      frame.orgId = record.orgId;
    }
    if (typeof record.dashboardId === 'string') {
      frame.dashboardId = record.dashboardId;
    }
    if (typeof record.reason === 'string') {
      frame.reason = record.reason;
    }
    if (typeof record.widgetId === 'string') {
      frame.widgetId = record.widgetId;
    }
    if (typeof record.state === 'object' && record.state !== null && !Array.isArray(record.state)) {
      frame.state = record.state as Record<string, JsonValue>;
    }
    return frame;
  } catch {
    return null;
  }
}

export function requireDashboardId(dashboardId?: string): string {
  if (!dashboardId) {
    throw new ApiError(400, 'No dashboard id');
  }
  return dashboardId;
}
