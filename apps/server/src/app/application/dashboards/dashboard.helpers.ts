import type { DashboardDetail, DashboardSummary, DashboardWidget } from '@harnesys/contracts';
import type { DashboardRecord, DashboardWidgetRecord } from '../../domain/dashboards/dashboard.ts';

export function toDashboardSummary(record: DashboardRecord, widgetCount: number): DashboardSummary {
  return {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    color: record.color,
    icon: record.icon,
    widgetCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toDashboardDetail(
  record: DashboardRecord,
  widgets: DashboardWidgetRecord[],
): DashboardDetail {
  return {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    color: record.color,
    icon: record.icon,
    widgets: widgets.map(toDashboardWidget),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toDashboardWidget(record: DashboardWidgetRecord): DashboardWidget {
  return {
    id: record.id,
    dashboardId: record.dashboardId,
    orgId: record.orgId,
    rect: record.rect,
    doc: record.doc,
    status: record.status,
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
