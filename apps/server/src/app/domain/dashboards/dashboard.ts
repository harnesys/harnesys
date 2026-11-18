import type { DashboardWidgetStatus, WidgetDoc, WidgetRect } from '@harnesys/contracts';

export interface DashboardRecord {
  orgId: string;
  id: string;
  name: string;
  color: string | null;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummaryRecord extends DashboardRecord {
  widgetCount: number;
}

export interface DashboardWidgetRecord {
  orgId: string;
  id: string;
  dashboardId: string;
  rect: WidgetRect;
  doc: WidgetDoc;
  status: DashboardWidgetStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardInsert {
  orgId: string;
  id: string;
  name: string;
  color?: string | null;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPatch {
  name?: string;
  color?: string | null;
  icon?: string;
  updatedAt: string;
}

export interface DashboardWidgetInsert {
  orgId: string;
  id: string;
  dashboardId: string;
  rect: WidgetRect;
  doc: WidgetDoc;
  status: DashboardWidgetStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidgetPatch {
  rect?: WidgetRect;
  doc?: WidgetDoc;
  status?: DashboardWidgetStatus;
  updatedAt: string;
}

export interface DashboardLayoutItemInput {
  widgetId: string;
  rect: WidgetRect;
}
