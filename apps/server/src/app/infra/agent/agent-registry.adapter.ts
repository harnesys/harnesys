import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import type { AgentHook, AgentLevel, AgentSourceLevel, AgentStatus } from '@harnesys/contracts';
import { AgentHookSchema, HookEventNameSchema } from '@harnesys/contracts';
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
import { type AgentRow, agentsTable } from '../org-sqlite/schema/index.ts';

const CONFIG_SKILLS = 'skills';
const CONFIG_MCP = 'mcpServers';
const CONFIG_PLUGINS = 'enabledPlugins';
const CONFIG_DEFAULT_MODE = 'defaultModeId';
const CONFIG_HOOKS = 'hooksJson';
const CONFIG_HOOKS_LEGACY = 'hooks';
const CONFIG_SHARED_SOURCES = 'sharedSourceIds';
const CONFIG_SOURCE_LEVELS = 'sourceLevels';
const CONFIG_SECRET_NAMES = 'secretNames';

@Injectable()
export class AgentRegistryAdapter extends AgentRegistryPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly deskEvents: DeskEventsPort,
  ) {
    super();
  }

  list(orgId: string): AgentRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.orgId, orgId))
        .all()
        .map(toRecord)
        .map((record) => pruneUnknownSources(db, orgId, record)),
    );
  }

  findById(orgId: string, id: string): AgentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
        .get();
      return row ? pruneUnknownSources(db, orgId, toRecord(row)) : undefined;
    });
  }

  findByName(orgId: string, name: string): AgentRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.name, name)))
        .get();
      return row ? pruneUnknownSources(db, orgId, toRecord(row)) : undefined;
    });
  }

  insert(rec: AgentRecord): AgentRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db.insert(agentsTable).values(toInsert(rec)).returning().get();
        const record = pruneUnknownSources(db, rec.orgId, toRecord(row));
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
        const existing = db
          .select()
          .from(agentsTable)
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
          .get();
        if (!existing) {
          throw new AgentNotFoundException(id);
        }
        const merged = applyPatch(toRecord(existing), patch);
        const row = db
          .update(agentsTable)
          .set(toInsert(merged))
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new AgentNotFoundException(id);
        }
        const record = pruneUnknownSources(db, orgId, toRecord(row));
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

function toInsert(rec: AgentRecord) {
  return {
    id: rec.id,
    orgId: rec.orgId,
    name: rec.name,
    role: rec.role,
    instructions: rec.instructions,
    model: rec.modelId,
    config: JSON.stringify(packConfig(rec)),
    budgetUsdDaily: rec.budgetUsdDaily,
    level: rec.level,
    parentId: rec.parentId,
    placement: '{}',
    executionProfileId: rec.executionProfileId,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function packConfig(rec: AgentRecord): Record<string, unknown> {
  return {
    ...rec.config,
    [CONFIG_SKILLS]: rec.skills,
    [CONFIG_MCP]: rec.mcpServers,
    [CONFIG_PLUGINS]: rec.enabledPlugins,
    [CONFIG_DEFAULT_MODE]: rec.defaultModeId,
    [CONFIG_HOOKS]: rec.hooks,
    [CONFIG_SHARED_SOURCES]: rec.sharedSourceIds,
    [CONFIG_SOURCE_LEVELS]: rec.sourceLevels,
    [CONFIG_SECRET_NAMES]: rec.secretNames,
  };
}

function toRecord(row: AgentRow): AgentRecord {
  const packed = parseObject(row.config);
  const skills = parseStringArray(packed[CONFIG_SKILLS]);
  const mcpServers = parseStringArray(packed[CONFIG_MCP]);
  const enabledPlugins = parseBooleanRecord(packed[CONFIG_PLUGINS]);
  const defaultModeId = parseNullableString(packed[CONFIG_DEFAULT_MODE]);
  const hooks = parseHooks(packed[CONFIG_HOOKS] ?? packed[CONFIG_HOOKS_LEGACY]);
  const sharedSourceIds = parseStringArray(packed[CONFIG_SHARED_SOURCES]);
  const sourceLevels = parseLevelRecord(packed[CONFIG_SOURCE_LEVELS]);
  const secretNames = parseStringArray(packed[CONFIG_SECRET_NAMES]);
  const config = omitConfigKeys(packed, [
    CONFIG_SKILLS,
    CONFIG_MCP,
    CONFIG_PLUGINS,
    CONFIG_DEFAULT_MODE,
    CONFIG_HOOKS,
    CONFIG_HOOKS_LEGACY,
    CONFIG_SHARED_SOURCES,
    CONFIG_SOURCE_LEVELS,
    CONFIG_SECRET_NAMES,
  ]);
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    role: row.role,
    instructions: row.instructions,
    modelId: row.model,
    budgetUsdDaily: row.budgetUsdDaily ?? null,
    level: row.level as AgentLevel,
    parentId: row.parentId,
    executionProfileId: row.executionProfileId ?? null,
    status: row.status as AgentStatus,
    sharedSourceIds,
    sourceLevels,
    secretNames,
    skills,
    mcpServers,
    enabledPlugins,
    defaultModeId,
    config,
    hooks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseHooks(value: unknown): AgentHook[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const hooks: AgentHook[] = [];
  value.forEach((entry, index) => {
    const parsed = parseHook(entry);
    if (parsed === undefined) {
      return;
    }
    hooks.push(
      parsed.id === undefined ? { ...parsed, id: `legacy-${parsed.event}-${index}` } : parsed,
    );
  });
  return hooks;
}

function parseHook(entry: unknown): AgentHook | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return undefined;
  }
  const row = entry as Record<string, unknown>;
  const event = typeof row.event === 'string' ? row.event : undefined;
  if (event === undefined || !HookEventNameSchema.safeParse(event).success) {
    return undefined;
  }
  const result = AgentHookSchema.safeParse({ ...row, event });
  if (!result.success) {
    return undefined;
  }
  return result.data;
}

function applyPatch(current: AgentRecord, patch: AgentPatch): AgentRecord {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function omitConfigKeys(packed: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...packed };
  for (const key of keys) {
    delete out[key];
  }
  return out;
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function parseBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      out[key] = entry;
    }
  }
  return out;
}

function parseLevelRecord(value: unknown): Record<string, AgentSourceLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, AgentSourceLevel> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === 'read' || entry === 'edit') {
      out[key] = entry;
    }
  }
  return out;
}

function parseNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
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
