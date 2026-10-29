import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import type { GrantClass, PluginOptionValue } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PluginConflictException,
  PluginNotFoundException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';
import type {
  PluginGrants,
  PluginInstallFormat,
  PluginInstallRecord,
} from '../../domain/plugin/plugin.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type PluginRow,
  pluginApprovalsTable,
  pluginServerStateTable,
  pluginsTable,
} from '../org-sqlite/schema/index.ts';

@Injectable()
export class PluginRegistryAdapter extends PluginRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): PluginInstallRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(pluginsTable).where(eq(pluginsTable.orgId, orgId)).all().map(toRecord),
    );
  }

  findByName(orgId: string, name: string): PluginInstallRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(pluginsTable)
        .where(and(eq(pluginsTable.orgId, orgId), eq(pluginsTable.name, name)))
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  upsert(rec: PluginInstallRecord): PluginInstallRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const id = pluginRowId(rec.orgId, rec.name);
        const values = {
          ...toRow(rec),
          id,
          orgId: rec.orgId,
          name: rec.name,
          installedAt: rec.installedAt,
        };
        const row = db
          .insert(pluginsTable)
          .values(values)
          .onConflictDoUpdate({
            target: pluginsTable.id,
            set: values,
          })
          .returning()
          .get();
        return toRecord(row);
      } catch (err) {
        throw mapPluginSqliteError(err);
      }
    });
  }

  delete(orgId: string, name: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(pluginsTable)
        .where(and(eq(pluginsTable.orgId, orgId), eq(pluginsTable.name, name)))
        .run();
      db.delete(pluginApprovalsTable)
        .where(
          and(eq(pluginApprovalsTable.orgId, orgId), eq(pluginApprovalsTable.pluginName, name)),
        )
        .run();
      db.delete(pluginServerStateTable)
        .where(
          and(eq(pluginServerStateTable.orgId, orgId), eq(pluginServerStateTable.pluginName, name)),
        )
        .run();
    });
  }

  setGrants(orgId: string, name: string, classes: GrantClass[]): PluginInstallRecord {
    const current = this.findByName(orgId, name);
    if (!current) {
      throw new PluginNotFoundException(name);
    }
    const grants: PluginGrants = {};
    for (const grantClass of classes) {
      grants[grantClass] = true;
    }
    return this.upsert({
      ...current,
      grants,
      updatedAt: new Date().toISOString(),
    });
  }

  setOption(
    orgId: string,
    name: string,
    key: string,
    value: PluginOptionValue,
  ): PluginInstallRecord {
    const current = this.findByName(orgId, name);
    if (!current) {
      throw new PluginNotFoundException(name);
    }
    return this.upsert({
      ...current,
      options: { ...current.options, [key]: value },
      updatedAt: new Date().toISOString(),
    });
  }

  approveServer(orgId: string, name: string, serverId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(pluginApprovalsTable)
        .values({
          orgId,
          pluginName: name,
          serverId,
          approvedAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
    });
  }

  approvals(orgId: string, name: string): string[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ serverId: pluginApprovalsTable.serverId })
        .from(pluginApprovalsTable)
        .where(
          and(eq(pluginApprovalsTable.orgId, orgId), eq(pluginApprovalsTable.pluginName, name)),
        )
        .all()
        .map((row) => row.serverId),
    );
  }

  setServerDisabled(name: string, serverId: string, orgId: string, disabled: boolean): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      if (disabled) {
        db.insert(pluginServerStateTable)
          .values({
            pluginName: name,
            serverId,
            orgId,
            disabledAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .run();
        return;
      }
      db.delete(pluginServerStateTable)
        .where(
          and(
            eq(pluginServerStateTable.pluginName, name),
            eq(pluginServerStateTable.serverId, serverId),
            eq(pluginServerStateTable.orgId, orgId),
          ),
        )
        .run();
    });
  }

  isServerDisabled(name: string, serverId: string, orgId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ serverId: pluginServerStateTable.serverId })
        .from(pluginServerStateTable)
        .where(
          and(
            eq(pluginServerStateTable.pluginName, name),
            eq(pluginServerStateTable.serverId, serverId),
            eq(pluginServerStateTable.orgId, orgId),
          ),
        )
        .get();
      return row !== undefined;
    });
  }

  listDisabledServers(orgId: string) {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({
          pluginName: pluginServerStateTable.pluginName,
          serverId: pluginServerStateTable.serverId,
        })
        .from(pluginServerStateTable)
        .where(eq(pluginServerStateTable.orgId, orgId))
        .all(),
    );
  }
}

export function pluginRowId(orgId: string, name: string): string {
  return `${orgId}::${name}`;
}

function toRecord(row: PluginRow): PluginInstallRecord {
  return {
    orgId: row.orgId,
    name: row.name,
    source: row.source,
    revision: row.revision,
    path: row.path,
    dataPath: row.dataPath,
    format: asFormat(row.format),
    grants: parseJsonObject(row.grants) as PluginGrants,
    options: parseJsonObject(row.options) as Record<string, PluginOptionValue>,
    ...(row.registryId ? { registryId: row.registryId } : {}),
    ...(row.catalogPluginName ? { catalogPluginName: row.catalogPluginName } : {}),
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(rec: PluginInstallRecord) {
  return {
    source: rec.source,
    revision: rec.revision,
    path: rec.path,
    dataPath: rec.dataPath,
    format: rec.format,
    grants: JSON.stringify(rec.grants),
    options: JSON.stringify(rec.options),
    registryId: rec.registryId ?? null,
    catalogPluginName: rec.catalogPluginName ?? null,
    updatedAt: rec.updatedAt,
  };
}

function asFormat(value: string | null): PluginInstallFormat {
  if (value === 'agent-plugins' || value === 'claude-compat' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return {};
}

function mapPluginSqliteError(err: unknown): never {
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new PluginConflictException('plugin exists');
  }
  if (err instanceof PluginNotFoundException || err instanceof PluginValidationException) {
    throw err;
  }
  throw err;
}
