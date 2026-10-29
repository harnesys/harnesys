import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { MaterializationOrigin, MaterializationState } from '@harnesys/contracts';
import { MaterializationOriginSchema, MaterializationStateSchema } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  decideMaterializationRevision,
  type MaterializationProjectionRecord,
  type MaterializationRecord,
  type MaterializationRevisionDecision,
  SourceMaterializationPort,
  type UpsertMaterializationInput,
} from '../../domain/source/source-materialization.port.ts';
import {
  sourceMaterializationProjections,
  sourceMaterializations,
} from '../org-sqlite/org.schema.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { configureOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';

@Injectable()
export class SourceMaterializationAdapter extends SourceMaterializationPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  find(orgId: string, sourceId: string, hostId: string): MaterializationRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializations } });
      const row = db
        .select()
        .from(sourceMaterializations)
        .where(
          and(
            eq(sourceMaterializations.orgId, orgId),
            eq(sourceMaterializations.sourceId, sourceId),
            eq(sourceMaterializations.hostId, hostId),
          ),
        )
        .get();
      return row ? mapMaterialization(row) : null;
    } finally {
      sqlite.close();
    }
  }

  listForSource(orgId: string, sourceId: string): MaterializationRecord[] {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializations } });
      return db
        .select()
        .from(sourceMaterializations)
        .where(
          and(
            eq(sourceMaterializations.orgId, orgId),
            eq(sourceMaterializations.sourceId, sourceId),
          ),
        )
        .all()
        .map(mapMaterialization);
    } finally {
      sqlite.close();
    }
  }

  upsert(input: UpsertMaterializationInput): void {
    const sqlite = this.open(input.orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializations } });
      const existing = db
        .select()
        .from(sourceMaterializations)
        .where(
          and(
            eq(sourceMaterializations.orgId, input.orgId),
            eq(sourceMaterializations.sourceId, input.sourceId),
            eq(sourceMaterializations.hostId, input.hostId),
          ),
        )
        .get();
      const values = {
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        origin: input.origin,
        localPath: input.localPath ?? null,
        state: input.state,
        lastError: input.lastError ?? null,
        revision: input.revision,
        updatedAt: input.updatedAt,
        lastConflictPaths: JSON.stringify(
          input.lastConflictPaths ?? existingConflictPaths(existing),
        ),
        refreshRequired: (input.refreshRequired ?? existingRefreshRequired(existing)) ? 1 : 0,
      };
      if (existing) {
        db.update(sourceMaterializations)
          .set(values)
          .where(
            and(
              eq(sourceMaterializations.orgId, input.orgId),
              eq(sourceMaterializations.sourceId, input.sourceId),
              eq(sourceMaterializations.hostId, input.hostId),
            ),
          )
          .run();
        return;
      }
      db.insert(sourceMaterializations).values(values).run();
    } finally {
      sqlite.close();
    }
  }

  removeForSource(orgId: string, sourceId: string): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, {
        schema: { sourceMaterializations, sourceMaterializationProjections },
      });
      db.delete(sourceMaterializations)
        .where(
          and(
            eq(sourceMaterializations.orgId, orgId),
            eq(sourceMaterializations.sourceId, sourceId),
          ),
        )
        .run();
      db.delete(sourceMaterializationProjections)
        .where(
          and(
            eq(sourceMaterializationProjections.orgId, orgId),
            eq(sourceMaterializationProjections.sourceId, sourceId),
          ),
        )
        .run();
    } finally {
      sqlite.close();
    }
  }

  findProjection(
    orgId: string,
    sourceId: string,
    hostId: string,
  ): MaterializationProjectionRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializationProjections } });
      const row = db
        .select()
        .from(sourceMaterializationProjections)
        .where(
          and(
            eq(sourceMaterializationProjections.orgId, orgId),
            eq(sourceMaterializationProjections.sourceId, sourceId),
            eq(sourceMaterializationProjections.hostId, hostId),
          ),
        )
        .get();
      return row ? mapProjection(row) : null;
    } finally {
      sqlite.close();
    }
  }

  listProjectionsForSource(orgId: string, sourceId: string): MaterializationProjectionRecord[] {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializationProjections } });
      return db
        .select()
        .from(sourceMaterializationProjections)
        .where(
          and(
            eq(sourceMaterializationProjections.orgId, orgId),
            eq(sourceMaterializationProjections.sourceId, sourceId),
          ),
        )
        .all()
        .map(mapProjection);
    } finally {
      sqlite.close();
    }
  }

  upsertProjection(input: MaterializationProjectionRecord): MaterializationRevisionDecision {
    const sqlite = this.open(input.orgId);
    try {
      const db = drizzle(sqlite, { schema: { sourceMaterializationProjections } });
      const existing = db
        .select()
        .from(sourceMaterializationProjections)
        .where(
          and(
            eq(sourceMaterializationProjections.orgId, input.orgId),
            eq(sourceMaterializationProjections.sourceId, input.sourceId),
            eq(sourceMaterializationProjections.hostId, input.hostId),
          ),
        )
        .get();
      const decision = decideMaterializationRevision(
        existing ? existing.revision : null,
        input.revision,
      );
      if (decision === 'ignored') {
        return decision;
      }
      const values = {
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        state: input.state,
        revision: input.revision,
        lastConfirmedAt: input.lastConfirmedAt,
        lastErrorCode: input.lastErrorCode,
        lastConflictPaths: JSON.stringify(input.lastConflictPaths),
        refreshRequired: input.refreshRequired ? 1 : 0,
      };
      if (existing) {
        if (decision === 'idempotent') {
          return decision;
        }
        db.update(sourceMaterializationProjections)
          .set(values)
          .where(
            and(
              eq(sourceMaterializationProjections.orgId, input.orgId),
              eq(sourceMaterializationProjections.sourceId, input.sourceId),
              eq(sourceMaterializationProjections.hostId, input.hostId),
            ),
          )
          .run();
        return decision;
      }
      db.insert(sourceMaterializationProjections).values(values).run();
      return decision;
    } finally {
      sqlite.close();
    }
  }

  private open(orgId: string): Database {
    const path = this.layout.orgDbPath(orgId);
    if (!existsSync(path) && !existsSync(dirname(path))) {
      this.layout.ensureOrgDir(orgId);
    }
    const sqlite = new Database(path, { create: true });
    configureOrgSqlite(sqlite);
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    return sqlite;
  }
}

function mapMaterialization(row: {
  orgId: string;
  sourceId: string;
  hostId: string;
  origin: string;
  localPath: string | null;
  state: string;
  lastError: string | null;
  revision: number;
  updatedAt: string;
  lastConflictPaths?: string | null;
  refreshRequired?: number | null;
}): MaterializationRecord {
  return {
    orgId: row.orgId,
    sourceId: row.sourceId,
    hostId: row.hostId,
    origin: asOrigin(row.origin),
    localPath: row.localPath,
    state: asState(row.state),
    lastError: row.lastError,
    revision: row.revision,
    updatedAt: row.updatedAt,
    lastConflictPaths: parseConflictPaths(row.lastConflictPaths),
    refreshRequired: row.refreshRequired === 1,
  };
}

function mapProjection(row: {
  orgId: string;
  sourceId: string;
  hostId: string;
  state: string;
  revision: number;
  lastConfirmedAt: string;
  lastErrorCode: string | null;
  lastConflictPaths?: string | null;
  refreshRequired?: number | null;
}): MaterializationProjectionRecord {
  return {
    orgId: row.orgId,
    sourceId: row.sourceId,
    hostId: row.hostId,
    state: asState(row.state),
    revision: row.revision,
    lastConfirmedAt: row.lastConfirmedAt,
    lastErrorCode: row.lastErrorCode,
    lastConflictPaths: parseConflictPaths(row.lastConflictPaths),
    refreshRequired: row.refreshRequired === 1,
  };
}

function asOrigin(value: string): MaterializationOrigin {
  const parsed = MaterializationOriginSchema.safeParse(value);
  return parsed.success ? parsed.data : 'attached';
}

function asState(value: string): MaterializationState {
  const parsed = MaterializationStateSchema.safeParse(value);
  return parsed.success ? parsed.data : 'absent';
}

function parseConflictPaths(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

function existingConflictPaths(row: { lastConflictPaths?: string | null } | undefined): string[] {
  return parseConflictPaths(row?.lastConflictPaths);
}

function existingRefreshRequired(row: { refreshRequired?: number | null } | undefined): boolean {
  return row?.refreshRequired === 1;
}
