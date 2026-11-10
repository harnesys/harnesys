import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { DbRow, DbRunResult, DbStatement, SqlParam } from '../services/sinks.ts';
import { AddonDbAccess } from '../services/sinks.ts';
import { AddonDb } from '../storage/addon-db.ts';

export function addonDataDirOf(layout: HostFsLayoutPort, orgId: string, addonId: string): string {
  return join(layout.orgDataDir(orgId), 'addons', addonId);
}

@Injectable()
export class AddonDbAccessAdapter extends AddonDbAccess {
  private readonly databases = new Map<string, AddonDb>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override async exec(orgId: string, addonId: string, sql: string): Promise<void> {
    this.dbOf(orgId, addonId).exec(sql);
  }

  override async all(
    orgId: string,
    addonId: string,
    sql: string,
    params?: SqlParam[],
  ): Promise<DbRow[]> {
    return this.dbOf(orgId, addonId).all(sql, params ?? []) as DbRow[];
  }

  override async get(
    orgId: string,
    addonId: string,
    sql: string,
    params?: SqlParam[],
  ): Promise<DbRow | null> {
    return (this.dbOf(orgId, addonId).get(sql, params ?? []) as DbRow | null) ?? null;
  }

  override async run(
    orgId: string,
    addonId: string,
    sql: string,
    params?: SqlParam[],
  ): Promise<DbRunResult> {
    return this.dbOf(orgId, addonId).run(sql, params ?? []);
  }

  override async batch(
    orgId: string,
    addonId: string,
    statements: DbStatement[],
  ): Promise<DbRunResult[]> {
    return this.dbOf(orgId, addonId).batch(
      statements.map((statement) => ({ sql: statement.sql, params: statement.params ?? [] })),
    );
  }

  closeAll(): void {
    for (const db of this.databases.values()) {
      db.close();
    }
    this.databases.clear();
  }

  private dbOf(orgId: string, addonId: string): AddonDb {
    const key = `${orgId}/${addonId}`;
    const existing = this.databases.get(key);
    if (existing) {
      return existing;
    }
    const db = new AddonDb(join(addonDataDirOf(this.layout, orgId, addonId), 'data.db'));
    this.databases.set(key, db);
    return db;
  }
}
