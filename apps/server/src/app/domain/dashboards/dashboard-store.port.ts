import type { JsonValue } from '@harnesys/contracts';
import type {
  DashboardInsert,
  DashboardLayoutItemInput,
  DashboardPatch,
  DashboardRecord,
  DashboardSummaryRecord,
  DashboardWidgetInsert,
  DashboardWidgetPatch,
  DashboardWidgetRecord,
} from './dashboard.ts';

export abstract class DashboardStorePort {
  abstract list(orgId: string): DashboardSummaryRecord[];

  abstract findDashboard(orgId: string, dashboardId: string): DashboardRecord | undefined;

  abstract insertDashboard(rec: DashboardInsert): DashboardRecord;

  abstract updateDashboard(
    orgId: string,
    dashboardId: string,
    patch: DashboardPatch,
  ): DashboardRecord | undefined;

  abstract deleteDashboard(orgId: string, dashboardId: string): boolean;

  abstract listWidgets(orgId: string, dashboardId: string): DashboardWidgetRecord[];

  abstract findWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
  ): DashboardWidgetRecord | undefined;

  abstract insertWidget(rec: DashboardWidgetInsert): DashboardWidgetRecord;

  abstract updateWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
    patch: DashboardWidgetPatch,
  ): DashboardWidgetRecord | undefined;

  abstract deleteWidget(orgId: string, dashboardId: string, widgetId: string): boolean;

  abstract updateLayout(
    orgId: string,
    dashboardId: string,
    items: DashboardLayoutItemInput[],
    updatedAt: string,
  ): void;

  abstract readWidgetState(orgId: string, widgetId: string): Record<string, JsonValue>;

  abstract writeWidgetState(
    orgId: string,
    widgetId: string,
    state: Record<string, JsonValue>,
    updatedAt: string,
  ): void;
}
