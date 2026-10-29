import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type {
  SourceAvailability,
  SourceDistribution,
  SourceVcs,
  UiVisibility,
} from '@harnesys/contracts';
import {
  SourceAvailabilitySchema,
  SourceDistributionSchema,
  SourceVcsSchema,
  UiVisibilitySchema,
} from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type InsertSourceInput,
  type SourceRecord,
  SourceRegistryPort,
} from '../../domain/source/source-registry.port.ts';
import { sources } from '../org-sqlite/org.schema.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { configureOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';

@Injectable()
export class SourceRegistryAdapter extends SourceRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): SourceRecord[] {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      return db.select().from(sources).where(eq(sources.orgId, orgId)).all().map(mapSource);
    } finally {
      sqlite.close();
    }
  }

  findById(orgId: string, sourceId: string): SourceRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const row = db
        .select()
        .from(sources)
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .get();
      return row ? mapSource(row) : null;
    } finally {
      sqlite.close();
    }
  }

  findManagedWorkspace(orgId: string): SourceRecord | null {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const rows = db
        .select()
        .from(sources)
        .where(and(eq(sources.orgId, orgId), eq(sources.managed, true)))
        .all();
      for (const row of rows) {
        const mapped = mapSource(row);
        if (mapped.distribution.kind === 'host-bound' && mapped.name === 'Workspace') {
          return mapped;
        }
      }
      return rows[0] ? mapSource(rows[0]) : null;
    } finally {
      sqlite.close();
    }
  }

  insert(input: InsertSourceInput): void {
    const sqlite = this.open(input.orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      db.insert(sources)
        .values({
          id: input.id,
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
          distributionJson: JSON.stringify(input.distribution),
          uiVisibility: input.uiVisibility,
          managed: input.managed,
          vcsJson: input.vcs === undefined ? null : JSON.stringify(input.vcs),
          availabilityJson: JSON.stringify(input.availability ?? { hostIds: [] }),
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateVisibility(orgId: string, sourceId: string, uiVisibility: UiVisibility): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ uiVisibility, updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateName(orgId: string, sourceId: string, name: string): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ name, updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateDistribution(orgId: string, sourceId: string, distribution: SourceDistribution): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ distributionJson: JSON.stringify(distribution), updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateVcs(orgId: string, sourceId: string, vcs: SourceVcs | null): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ vcsJson: vcs === null ? null : JSON.stringify(vcs), updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateAvailability(orgId: string, sourceId: string, availability: SourceAvailability): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ availabilityJson: JSON.stringify(availability), updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  updateLspJson(orgId: string, sourceId: string, lspJson: string | null): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      const now = new Date().toISOString();
      db.update(sources)
        .set({ lspJson, updatedAt: now })
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
    } finally {
      sqlite.close();
    }
  }

  remove(orgId: string, sourceId: string): void {
    const sqlite = this.open(orgId);
    try {
      const db = drizzle(sqlite, { schema: { sources } });
      db.delete(sources)
        .where(and(eq(sources.orgId, orgId), eq(sources.id, sourceId)))
        .run();
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

function mapSource(row: {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  distributionJson: string;
  uiVisibility: string;
  managed: boolean;
  lspJson: string | null;
  vcsJson: string | null;
  availabilityJson: string;
  createdAt: string;
  updatedAt: string;
}): SourceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name || 'Source',
    description: row.description ?? null,
    distribution: parseDistribution(row.distributionJson),
    uiVisibility: asVisibility(row.uiVisibility),
    managed: Boolean(row.managed),
    vcs: parseVcs(row.vcsJson),
    availability: parseAvailability(row.availabilityJson),
    lspJson: row.lspJson ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
function parseVcs(raw: string | null): SourceVcs | null {
  if (raw === null) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(raw);
    const parsed = SourceVcsSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fall through
  }
  return null;
}

function parseAvailability(raw: string): SourceAvailability {
  try {
    const json: unknown = JSON.parse(raw);
    const parsed = SourceAvailabilitySchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fall through
  }
  return { hostIds: [] };
}

function asVisibility(value: string): UiVisibility {
  const parsed = UiVisibilitySchema.safeParse(value);
  return parsed.success ? parsed.data : 'org';
}

function parseDistribution(raw: string): SourceDistribution {
  try {
    const json: unknown = JSON.parse(raw);
    const parsed = SourceDistributionSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fall through
  }
  return { kind: 'host-bound', hostId: '00000000-0000-4000-8000-000000000000' };
}
