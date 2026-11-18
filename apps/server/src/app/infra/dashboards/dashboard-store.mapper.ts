import type { WidgetRect } from '@harnesys/contracts';
import { WidgetRectSchema } from '@harnesys/contracts';
import type {
  DashboardInsert,
  DashboardRecord,
  DashboardWidgetInsert,
} from '../../domain/dashboards/dashboard.ts';
import type {
  DashboardInsertRow,
  DashboardRow,
  DashboardWidgetInsertRow,
} from '../org-sqlite/schema/index.ts';

export function toDashboardRecord(row: DashboardRow): DashboardRecord {
  return {
    orgId: row.orgId,
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    icon: row.icon ?? 'layout-dashboard',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDashboardInsertRow(rec: DashboardInsert): DashboardInsertRow {
  return {
    orgId: rec.orgId,
    id: rec.id,
    name: rec.name,
    ...(rec.color !== undefined && rec.color !== null ? { color: rec.color } : {}),
    ...(rec.icon ? { icon: rec.icon } : {}),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function toWidgetInsertRow(rec: DashboardWidgetInsert): DashboardWidgetInsertRow {
  return {
    orgId: rec.orgId,
    id: rec.id,
    dashboardId: rec.dashboardId,
    slotJson: JSON.stringify(rec.rect),
    docJson: JSON.stringify(rec.doc),
    status: rec.status,
    ...(rec.createdBy ? { createdBy: rec.createdBy } : {}),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function parseRect(raw: string): WidgetRect {
  const parsed = WidgetRectSchema.safeParse(parseJson(raw));
  return parsed.success ? parsed.data : { x: 0, y: 0, w: 384, h: 240 };
}

export function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}
