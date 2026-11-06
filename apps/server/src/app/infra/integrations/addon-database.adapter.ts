import type { SQLQueryBindings } from 'bun:sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { AddonDatabase } from 'harnesys/integration';
import { AddonDatabasePort } from '../../domain/integration/addon-database.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

const ADDON_SQLITE_BUSY_TIMEOUT_MS = 5_000;

@Injectable()
export class AddonDatabaseAdapter extends AddonDatabasePort {
  private readonly handles = new Map<string, AddonDatabaseHandle>();

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override open(orgId: string, integrationId: string): AddonDatabase {
    const key = handleKey(orgId, integrationId);
    const existing = this.handles.get(key);
    if (existing) {
      return existing;
    }
    const dir = this.directoryOf(orgId, integrationId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'data.db');
    const sqlite = new Database(path, { create: true });
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec(`PRAGMA busy_timeout = ${ADDON_SQLITE_BUSY_TIMEOUT_MS};`);
    sqlite.exec('PRAGMA foreign_keys = ON;');
    const handle = new AddonDatabaseHandle(path, sqlite);
    this.handles.set(key, handle);
    return handle;
  }

  override close(orgId: string, integrationId: string): void {
    const key = handleKey(orgId, integrationId);
    const handle = this.handles.get(key);
    if (!handle) {
      return;
    }
    this.handles.delete(key);
    handle.close();
  }

  override remove(orgId: string, integrationId: string): void {
    this.close(orgId, integrationId);
    rmSync(this.directoryOf(orgId, integrationId), { recursive: true, force: true });
  }

  private directoryOf(orgId: string, integrationId: string): string {
    return join(this.layout.orgDataDir(orgId), 'integrations', integrationId);
  }
}

class AddonDatabaseHandle implements AddonDatabase {
  readonly path: string;

  private closed = false;

  constructor(
    path: string,
    private readonly sqlite: Database,
  ) {
    this.path = path;
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }

  all<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row[] {
    return this.sqlite.query(sql).all(...bindParams(params)) as Row[];
  }

  get<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Row | undefined {
    const row = this.sqlite.query(sql).get(...bindParams(params)) as Row | null;
    return row ?? undefined;
  }

  run(sql: string, params?: readonly unknown[]): void {
    this.sqlite.query(sql).run(...bindParams(params));
  }

  insertReturning<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Row | undefined {
    const row = this.sqlite.query(sql).get(...bindParams(params)) as Row | null;
    return row ?? undefined;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.sqlite.close();
  }
}

function handleKey(orgId: string, integrationId: string): string {
  return `${orgId}:${integrationId}`;
}

function bindParams(params?: readonly unknown[]): SQLQueryBindings[] {
  return (params ?? []) as SQLQueryBindings[];
}
