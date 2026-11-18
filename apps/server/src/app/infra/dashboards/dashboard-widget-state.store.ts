import type { JsonValue } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type DashboardWidgetStateInsertRow,
  dashboardWidgetStateTable,
} from '../org-sqlite/schema/index.ts';
import { parseJson } from './dashboard-store.mapper.ts';

export function readWidgetStateRows(
  db: OrgSqliteDb,
  orgId: string,
  widgetId: string,
): Record<string, JsonValue> {
  const state: Record<string, JsonValue> = {};
  for (const row of db
    .select()
    .from(dashboardWidgetStateTable)
    .where(
      and(
        eq(dashboardWidgetStateTable.orgId, orgId),
        eq(dashboardWidgetStateTable.widgetId, widgetId),
      ),
    )
    .all()) {
    state[row.key] = parseJson(row.valueJson) as JsonValue;
  }
  return state;
}

export function writeWidgetStateRows(
  db: OrgSqliteDb,
  orgId: string,
  widgetId: string,
  state: Record<string, JsonValue>,
  updatedAt: string,
): void {
  db.transaction((tx) => {
    tx.delete(dashboardWidgetStateTable)
      .where(
        and(
          eq(dashboardWidgetStateTable.orgId, orgId),
          eq(dashboardWidgetStateTable.widgetId, widgetId),
        ),
      )
      .run();
    const rows: DashboardWidgetStateInsertRow[] = Object.entries(state).map(([key, value]) => ({
      orgId,
      widgetId,
      key,
      valueJson: JSON.stringify(value),
      updatedAt,
    }));
    if (rows.length > 0) {
      tx.insert(dashboardWidgetStateTable).values(rows).run();
    }
  });
}
