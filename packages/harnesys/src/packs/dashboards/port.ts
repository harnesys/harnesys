import type {
  DashboardDetail,
  DashboardListResponse,
  UpdateLayoutBody,
  WidgetDoc,
  WidgetRect,
  WidgetSource,
} from '@harnesys/contracts';

export interface WidgetSourceTestResult {
  ok: boolean;
  status?: number;
  json?: unknown;
  error?: string;
}

/**
 * Port the `dashboards` pack tools call. Implemented server-side over
 * dashboard use-cases; the port interface lives here so the pack stays
 * decoupled from server internals.
 */
export interface DashboardsPackPort {
  createDashboard(orgId: string, name: string): Promise<{ id: string }>;
  listDashboards(orgId: string): Promise<DashboardListResponse>;
  getDashboard(orgId: string, dashboardId: string): Promise<DashboardDetail>;
  updateDashboard(orgId: string, dashboardId: string, name: string): Promise<void>;
  deleteDashboard(orgId: string, dashboardId: string): Promise<void>;
  createWidget(
    orgId: string,
    dashboardId: string,
    input: { rect: WidgetRect; doc: WidgetDoc; draft: boolean },
  ): Promise<{ widgetId: string }>;
  updateWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
    patch: { rect?: WidgetRect; doc?: WidgetDoc },
  ): Promise<void>;
  deleteWidget(orgId: string, dashboardId: string, widgetId: string): Promise<void>;
  updateLayout(orgId: string, dashboardId: string, body: UpdateLayoutBody): Promise<void>;
  activateWidget(orgId: string, dashboardId: string, widgetId: string): Promise<void>;
  testSource(orgId: string, source: WidgetSource): Promise<WidgetSourceTestResult>;
}
