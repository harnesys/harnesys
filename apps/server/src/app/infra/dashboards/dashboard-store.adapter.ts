import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { DashboardWidgetStatus, JsonValue, WidgetDoc } from '@harnesys/contracts';
import { WidgetDocSchema } from '@harnesys/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  DashboardInsert,
  DashboardLayoutItemInput,
  DashboardPatch,
  DashboardRecord,
  DashboardSummaryRecord,
  DashboardWidgetInsert,
  DashboardWidgetPatch,
  DashboardWidgetRecord,
} from '../../domain/dashboards/dashboard.ts';
import { DashboardStorePort } from '../../domain/dashboards/dashboard-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type DashboardRow,
  type DashboardWidgetInsertRow,
  type DashboardWidgetRow,
  dashboardsTable,
  dashboardWidgetStateTable,
  dashboardWidgetsTable,
} from '../org-sqlite/schema/index.ts';
import {
  parseJson,
  parseRect,
  toDashboardInsertRow,
  toDashboardRecord,
  toWidgetInsertRow,
} from './dashboard-store.mapper.ts';
import { readWidgetStateRows, writeWidgetStateRows } from './dashboard-widget-state.store.ts';

@Injectable()
export class DashboardStoreAdapter extends DashboardStorePort {
  private readonly logger: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('dashboard-store');
  }

  override list(orgId: string): DashboardSummaryRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db.select().from(dashboardsTable).where(eq(dashboardsTable.orgId, orgId)).all();
      const counts = new Map<string, number>();
      for (const row of db
        .select({ dashboardId: dashboardWidgetsTable.dashboardId, total: sql<number>`count(*)` })
        .from(dashboardWidgetsTable)
        .where(eq(dashboardWidgetsTable.orgId, orgId))
        .groupBy(dashboardWidgetsTable.dashboardId)
        .all()) {
        counts.set(row.dashboardId, Number(row.total));
      }
      return rows.map((row) => ({
        ...toDashboardRecord(row),
        widgetCount: counts.get(row.id) ?? 0,
      }));
    });
  }

  override findDashboard(orgId: string, dashboardId: string): DashboardRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(dashboardsTable)
        .where(and(eq(dashboardsTable.orgId, orgId), eq(dashboardsTable.id, dashboardId)))
        .get();
      return row ? toDashboardRecord(row) : undefined;
    });
  }

  override insertDashboard(rec: DashboardInsert): DashboardRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(dashboardsTable).values(toDashboardInsertRow(rec)).returning().get();
      return toDashboardRecord(row as DashboardRow);
    });
  }

  override updateDashboard(
    orgId: string,
    dashboardId: string,
    patch: DashboardPatch,
  ): DashboardRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .update(dashboardsTable)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
          updatedAt: patch.updatedAt,
        })
        .where(and(eq(dashboardsTable.orgId, orgId), eq(dashboardsTable.id, dashboardId)))
        .returning()
        .get();
      return row ? toDashboardRecord(row) : undefined;
    });
  }

  override deleteDashboard(orgId: string, dashboardId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const widgetIds = tx
          .select({ id: dashboardWidgetsTable.id })
          .from(dashboardWidgetsTable)
          .where(
            and(
              eq(dashboardWidgetsTable.orgId, orgId),
              eq(dashboardWidgetsTable.dashboardId, dashboardId),
            ),
          )
          .all()
          .map((row) => row.id);
        if (widgetIds.length > 0) {
          tx.delete(dashboardWidgetStateTable)
            .where(
              and(
                eq(dashboardWidgetStateTable.orgId, orgId),
                inArray(dashboardWidgetStateTable.widgetId, widgetIds),
              ),
            )
            .run();
        }
        const removed = tx
          .delete(dashboardsTable)
          .where(and(eq(dashboardsTable.orgId, orgId), eq(dashboardsTable.id, dashboardId)))
          .returning()
          .all();
        tx.delete(dashboardWidgetsTable)
          .where(
            and(
              eq(dashboardWidgetsTable.orgId, orgId),
              eq(dashboardWidgetsTable.dashboardId, dashboardId),
            ),
          )
          .run();
        return removed.length > 0;
      }),
    );
  }

  override listWidgets(orgId: string, dashboardId: string): DashboardWidgetRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(dashboardWidgetsTable)
        .where(
          and(
            eq(dashboardWidgetsTable.orgId, orgId),
            eq(dashboardWidgetsTable.dashboardId, dashboardId),
          ),
        )
        .all()
        .map((row) => this.toWidgetRecord(row)),
    );
  }

  override findWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
  ): DashboardWidgetRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(dashboardWidgetsTable)
        .where(
          and(
            eq(dashboardWidgetsTable.orgId, orgId),
            eq(dashboardWidgetsTable.dashboardId, dashboardId),
            eq(dashboardWidgetsTable.id, widgetId),
          ),
        )
        .get();
      return row ? this.toWidgetRecord(row) : undefined;
    });
  }

  override insertWidget(rec: DashboardWidgetInsert): DashboardWidgetRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(dashboardWidgetsTable).values(toWidgetInsertRow(rec)).returning().get();
      return this.toWidgetRecord(row as DashboardWidgetRow);
    });
  }

  override updateWidget(
    orgId: string,
    dashboardId: string,
    widgetId: string,
    patch: DashboardWidgetPatch,
  ): DashboardWidgetRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const values: Partial<DashboardWidgetInsertRow> = { updatedAt: patch.updatedAt };
      if (patch.rect !== undefined) {
        values.slotJson = JSON.stringify(patch.rect);
      }
      if (patch.doc !== undefined) {
        values.docJson = JSON.stringify(patch.doc);
      }
      if (patch.status !== undefined) {
        values.status = patch.status;
      }
      const row = db
        .update(dashboardWidgetsTable)
        .set(values)
        .where(
          and(
            eq(dashboardWidgetsTable.orgId, orgId),
            eq(dashboardWidgetsTable.dashboardId, dashboardId),
            eq(dashboardWidgetsTable.id, widgetId),
          ),
        )
        .returning()
        .get();
      return row ? this.toWidgetRecord(row) : undefined;
    });
  }

  override deleteWidget(orgId: string, dashboardId: string, widgetId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const removed = tx
          .delete(dashboardWidgetsTable)
          .where(
            and(
              eq(dashboardWidgetsTable.orgId, orgId),
              eq(dashboardWidgetsTable.dashboardId, dashboardId),
              eq(dashboardWidgetsTable.id, widgetId),
            ),
          )
          .returning()
          .all();
        tx.delete(dashboardWidgetStateTable)
          .where(
            and(
              eq(dashboardWidgetStateTable.orgId, orgId),
              eq(dashboardWidgetStateTable.widgetId, widgetId),
            ),
          )
          .run();
        return removed.length > 0;
      }),
    );
  }

  override updateLayout(
    orgId: string,
    dashboardId: string,
    items: DashboardLayoutItemInput[],
    updatedAt: string,
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.transaction((tx) => {
        for (const item of items) {
          tx.update(dashboardWidgetsTable)
            .set({ slotJson: JSON.stringify(item.rect), updatedAt })
            .where(
              and(
                eq(dashboardWidgetsTable.orgId, orgId),
                eq(dashboardWidgetsTable.dashboardId, dashboardId),
                eq(dashboardWidgetsTable.id, item.widgetId),
              ),
            )
            .run();
        }
      });
    });
  }

  override readWidgetState(orgId: string, widgetId: string): Record<string, JsonValue> {
    return withOrgSqlite(this.layout, orgId, (db) => readWidgetStateRows(db, orgId, widgetId));
  }

  override writeWidgetState(
    orgId: string,
    widgetId: string,
    state: Record<string, JsonValue>,
    updatedAt: string,
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      writeWidgetStateRows(db, orgId, widgetId, state, updatedAt);
    });
  }

  private toWidgetRecord(row: DashboardWidgetRow): DashboardWidgetRecord {
    return {
      orgId: row.orgId,
      id: row.id,
      dashboardId: row.dashboardId,
      rect: parseRect(row.slotJson),
      doc: this.parseDoc(row.docJson, row.id),
      status: row.status as DashboardWidgetStatus,
      ...(row.createdBy ? { createdBy: row.createdBy } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Write paths validate docs (validateWidgetDoc); a failure here means manual DB edits. */
  private parseDoc(raw: string, widgetId: string): WidgetDoc {
    const parsed = WidgetDocSchema.safeParse(parseJson(raw));
    if (parsed.success) {
      return parsed.data;
    }
    this.logger.warn({ widgetId }, 'widget doc failed schema validation; rendering fallback');
    return {
      schemaVersion: 1,
      title: 'invalid',
      primitive: 'custom',
      items: [],
      state: {},
      sources: [],
      derived: {},
      config: {},
    };
  }
}
