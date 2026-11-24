import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { toAgentPublic } from '../../application/agents/agent.helpers.ts';
import {
  AgentConflictException,
  AgentNotFoundException,
  AgentValidationException,
} from '../../domain/agent/agent.error.ts';
import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskEventsPort } from '../../domain/desk/desk-events.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { sources } from '../org-sqlite/org.schema.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { agentsTable } from '../org-sqlite/schema/index.ts';
import { sourceRootsOf } from '../org-sqlite/source-roots.query.ts';
import type { SourceRoot } from '../thread/legacy-workspace-ref.ts';
import { packConfig, toRecord } from './agent-config-pack.ts';

@Injectable()
export class AgentRegistryAdapter extends AgentRegistryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly deskEvents: DeskEventsPort,
  ) {
    super();
  }

  list(orgId: string): AgentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const sourceRoots = sourceRootsOf(db, orgId);
      return db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.orgId, orgId))
        .all()
        .map((row) => toRecord(row, sourceRoots))
        .map((record) => pruneUnknownSources(db, orgId, record));
    });
  }

  findById(orgId: string, id: string): AgentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
        .get();
      return row
        ? pruneUnknownSources(db, orgId, toRecord(row, sourceRootsOf(db, orgId)))
        : undefined;
    });
  }

  findByName(orgId: string, name: string): AgentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.name, name)))
        .get();
      return row
        ? pruneUnknownSources(db, orgId, toRecord(row, sourceRootsOf(db, orgId)))
        : undefined;
    });
  }

  insert(rec: AgentRecord): AgentRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const sourceRoots = sourceRootsOf(db, rec.orgId);
        const row = db.insert(agentsTable).values(toInsert(rec, sourceRoots)).returning().get();
        const record = pruneUnknownSources(db, rec.orgId, toRecord(row, sourceRoots));
        this.deskEvents.emit(rec.orgId, { type: 'agent', agent: toAgentPublic(record) });
        return record;
      } catch (err) {
        throw mapAgentSqliteError(err);
      }
    });
  }

  update(orgId: string, id: string, patch: AgentPatch): AgentRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const sourceRoots = sourceRootsOf(db, orgId);
        const existing = db
          .select()
          .from(agentsTable)
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
          .get();
        if (!existing) {
          throw new AgentNotFoundException(id);
        }
        const merged = applyPatch(toRecord(existing, sourceRoots), patch);
        const row = db
          .update(agentsTable)
          .set(toInsert(merged, sourceRoots))
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new AgentNotFoundException(id);
        }
        const record = pruneUnknownSources(db, orgId, toRecord(row, sourceRoots));
        this.deskEvents.emit(orgId, { type: 'agent', agent: toAgentPublic(record) });
        return record;
      } catch (err) {
        throw mapAgentSqliteError(err);
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
        .run();
    });
    this.deskEvents.emit(orgId, { type: 'agent-deleted', id });
  }
}

function pruneUnknownSources(db: OrgSqliteDb, orgId: string, record: AgentRecord): AgentRecord {
  if (record.sharedSourceIds.length === 0 && Object.keys(record.sourceLevels).length === 0) {
    return record;
  }
  const known = new Set(
    db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.orgId, orgId))
      .all()
      .map((row) => row.id),
  );
  return {
    ...record,
    sharedSourceIds: record.sharedSourceIds.filter((id) => known.has(id)),
    sourceLevels: Object.fromEntries(
      Object.entries(record.sourceLevels).filter(([id]) => known.has(id)),
    ),
  };
}

function toInsert(rec: AgentRecord, sourceRoots: SourceRoot[]) {
  return {
    id: rec.id,
    orgId: rec.orgId,
    name: rec.name,
    role: rec.role,
    instructions: rec.instructions,
    model: rec.modelId,
    config: JSON.stringify(packConfig(rec, sourceRoots)),
    budgetUsdDaily: rec.budgetUsdDaily,
    level: rec.level,
    parentId: rec.parentId,
    departmentId: rec.departmentId,
    placement: '{}',
    executionProfileId: rec.executionProfileId,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function applyPatch(current: AgentRecord, patch: AgentPatch): AgentRecord {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function mapAgentSqliteError(err: unknown): never {
  if (err instanceof AgentNotFoundException || err instanceof AgentValidationException) {
    throw err;
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new AgentConflictException('agent name taken in org');
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_BUSY') {
    throw new AgentConflictException('database busy, retry');
  }
  throw err;
}
