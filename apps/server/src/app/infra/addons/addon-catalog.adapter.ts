import { Injectable } from '@harnesys/brix';
import type { AddonConfigValues, AddonState } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import {
  AddonCatalogPort,
  type AddonConfigRecord,
  type AddonStateRecord,
} from '../../domain/addons/addon-catalog.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { addonConfigTable, addonsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class AddonCatalogAdapter extends AddonCatalogPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override list(orgId: string): AddonStateRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(addonsTable).where(eq(addonsTable.orgId, orgId)).all().map(toRecord),
    );
  }

  override find(orgId: string, addonId: string): AddonStateRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(addonsTable)
        .where(and(eq(addonsTable.orgId, orgId), eq(addonsTable.id, addonId)))
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  override upsert(record: AddonStateRecord): AddonStateRecord {
    return withOrgSqlite(this.layout, record.orgId, (db) => {
      const row = db
        .insert(addonsTable)
        .values({
          id: record.id,
          orgId: record.orgId,
          version: record.version,
          title: record.title,
          description: record.description,
          icon: record.icon,
          tagsJson: JSON.stringify(record.tags),
          root: record.root,
          entry: record.entry,
          state: record.state,
          enabledAt: record.enabledAt ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })
        .onConflictDoUpdate({
          target: addonsTable.id,
          set: {
            version: record.version,
            title: record.title,
            description: record.description,
            icon: record.icon,
            tagsJson: JSON.stringify(record.tags),
            root: record.root,
            entry: record.entry,
            state: record.state,
            enabledAt: record.enabledAt ?? null,
            updatedAt: record.updatedAt,
          },
        })
        .returning()
        .get();
      return toRecord(row);
    });
  }

  override remove(orgId: string, addonId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(addonConfigTable)
        .where(and(eq(addonConfigTable.orgId, orgId), eq(addonConfigTable.addonId, addonId)))
        .run();
      db.delete(addonsTable)
        .where(and(eq(addonsTable.orgId, orgId), eq(addonsTable.id, addonId)))
        .run();
    });
  }

  override readConfig(orgId: string, addonId: string): AddonConfigRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(addonConfigTable)
        .where(and(eq(addonConfigTable.orgId, orgId), eq(addonConfigTable.addonId, addonId)))
        .get();
      return row ? { values: parseValues(row.valuesJson), updatedAt: row.updatedAt } : undefined;
    });
  }

  override writeConfig(orgId: string, addonId: string, values: AddonConfigValues): void {
    const now = new Date().toISOString();
    withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(addonConfigTable)
        .values({ orgId, addonId, valuesJson: JSON.stringify(values), updatedAt: now })
        .onConflictDoUpdate({
          target: [addonConfigTable.orgId, addonConfigTable.addonId],
          set: { valuesJson: JSON.stringify(values), updatedAt: now },
        })
        .run();
    });
  }
}

function toRecord(row: typeof addonsTable.$inferSelect): AddonStateRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    version: row.version,
    title: row.title,
    description: row.description,
    icon: row.icon,
    tags: parseTags(row.tagsJson),
    root: row.root,
    entry: row.entry,
    state: row.state as AddonState,
    ...(row.enabledAt ? { enabledAt: row.enabledAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

function parseValues(raw: string): AddonConfigValues {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as AddonConfigValues;
    }
  } catch {}
  return {};
}
