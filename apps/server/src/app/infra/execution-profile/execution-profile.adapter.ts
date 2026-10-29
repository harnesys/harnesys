import { Injectable } from '@harnesys/brix';
import { and, eq, sql } from 'drizzle-orm';
import {
  ExecutionProfileNotFoundException,
  ExecutionProfileSystemException,
} from '../../domain/execution-profile/execution-profile.error.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import {
  type CreateExecutionProfileInput,
  type ExecutionProfileRecord,
  LOCAL_EXECUTION_PROFILE_ID,
  LOCAL_EXECUTION_PROFILE_NAME,
  type ProfileUsage,
  type UpdateExecutionProfileInput,
} from '../../domain/execution-profile/execution-profile.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  agentsTable,
  boardRulesTable,
  executionProfileNodesTable,
  executionProfilesTable,
  orgExecutionSettingsTable,
} from '../org-sqlite/schema/index.ts';
import {
  assertProfileUpdatable,
  fetchNodeIds,
  fetchProfileById,
  fetchProfileByName,
  listProfiles,
  mapProfileError,
  normalizeName,
  resolveProfileUpdate,
  validateNodesBelongToOrg,
} from './execution-profile-sqlite.ts';

@Injectable()
export class ExecutionProfileAdapter extends ExecutionProfilePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): ExecutionProfileRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listProfiles(db, orgId));
  }

  findById(orgId: string, profileId: string): ExecutionProfileRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => fetchProfileById(db, orgId, profileId));
  }

  findByName(orgId: string, name: string): ExecutionProfileRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => fetchProfileByName(db, orgId, name));
  }

  insert(orgId: string, input: CreateExecutionProfileInput): ExecutionProfileRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      try {
        db.insert(executionProfilesTable)
          .values({
            id,
            orgId,
            name: input.name.trim(),
            system: false,
            normalizedName: normalizeName(input.name),
            isolation: 'host',
            dockerImage: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } catch (err) {
        throw mapProfileError(err);
      }
      return {
        id,
        orgId,
        name: input.name.trim(),
        system: false,
        nodeIds: [],
        isolation: 'host',
        dockerImage: null,
      };
    });
  }

  update(
    orgId: string,
    profileId: string,
    input: UpdateExecutionProfileInput,
  ): ExecutionProfileRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const existing = this.findById(orgId, profileId);
      if (!existing) {
        throw new ExecutionProfileNotFoundException(profileId);
      }
      assertProfileUpdatable(existing, input);
      const next = resolveProfileUpdate(existing, input);
      const now = new Date().toISOString();
      try {
        db.update(executionProfilesTable)
          .set({ ...next, normalizedName: normalizeName(next.name), updatedAt: now })
          .where(
            and(eq(executionProfilesTable.orgId, orgId), eq(executionProfilesTable.id, profileId)),
          )
          .run();
      } catch (err) {
        throw mapProfileError(err);
      }
      return { ...existing, ...next, nodeIds: fetchNodeIds(db, profileId) };
    });
  }

  setNodes(orgId: string, profileId: string, nodeIds: string[]): ExecutionProfileRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const existing = this.findById(orgId, profileId);
      if (!existing) {
        throw new ExecutionProfileNotFoundException(profileId);
      }
      validateNodesBelongToOrg(db, orgId, nodeIds);
      const now = new Date().toISOString();
      db.delete(executionProfileNodesTable)
        .where(eq(executionProfileNodesTable.profileId, profileId))
        .run();
      if (nodeIds.length > 0) {
        db.insert(executionProfileNodesTable)
          .values(
            nodeIds.map((nodeId) => ({
              profileId,
              nodeId,
              orgId,
              createdAt: now,
            })),
          )
          .run();
      }
      db.update(executionProfilesTable)
        .set({ updatedAt: now })
        .where(eq(executionProfilesTable.id, profileId))
        .run();
      return { ...existing, nodeIds };
    });
  }

  removeNodeFromAll(orgId: string, nodeId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const profileIds = db
        .select({ profileId: executionProfileNodesTable.profileId })
        .from(executionProfileNodesTable)
        .where(
          and(
            eq(executionProfileNodesTable.orgId, orgId),
            eq(executionProfileNodesTable.nodeId, nodeId),
          ),
        )
        .all()
        .map((row) => row.profileId);
      db.delete(executionProfileNodesTable)
        .where(
          and(
            eq(executionProfileNodesTable.orgId, orgId),
            eq(executionProfileNodesTable.nodeId, nodeId),
          ),
        )
        .run();
      for (const profileId of profileIds) {
        db.update(executionProfilesTable)
          .set({ updatedAt: now })
          .where(eq(executionProfilesTable.id, profileId))
          .run();
      }
    });
  }

  getDefault(orgId: string): string | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ defaultProfileId: orgExecutionSettingsTable.defaultProfileId })
        .from(orgExecutionSettingsTable)
        .where(eq(orgExecutionSettingsTable.orgId, orgId))
        .get();
      return row?.defaultProfileId ?? undefined;
    });
  }

  setDefault(orgId: string, profileId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = this.findById(orgId, profileId);
      if (!existing) {
        throw new ExecutionProfileNotFoundException(profileId);
      }
      const now = new Date().toISOString();
      db.insert(orgExecutionSettingsTable)
        .values({ orgId, defaultProfileId: profileId, updatedAt: now })
        .onConflictDoUpdate({
          target: orgExecutionSettingsTable.orgId,
          set: { defaultProfileId: profileId, updatedAt: now },
        })
        .run();
    });
  }

  delete(orgId: string, profileId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = this.findById(orgId, profileId);
      if (!existing) {
        throw new ExecutionProfileNotFoundException(profileId);
      }
      if (existing.system) {
        throw new ExecutionProfileSystemException('cannot delete system profile');
      }
      db.delete(executionProfilesTable)
        .where(
          and(eq(executionProfilesTable.orgId, orgId), eq(executionProfilesTable.id, profileId)),
        )
        .run();
    });
  }

  ensureLocalDefault(orgId: string, relayNodeId: string): ExecutionProfileRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const existing = fetchProfileById(db, orgId, LOCAL_EXECUTION_PROFILE_ID);
      if (!existing) {
        db.insert(executionProfilesTable)
          .values({
            id: LOCAL_EXECUTION_PROFILE_ID,
            orgId,
            name: LOCAL_EXECUTION_PROFILE_NAME,
            system: true,
            normalizedName: normalizeName(LOCAL_EXECUTION_PROFILE_NAME),
            isolation: 'host',
            dockerImage: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        db.insert(executionProfileNodesTable)
          .values({
            profileId: LOCAL_EXECUTION_PROFILE_ID,
            nodeId: relayNodeId,
            orgId,
            createdAt: now,
          })
          .run();
      }
      const settings = db
        .select({ defaultProfileId: orgExecutionSettingsTable.defaultProfileId })
        .from(orgExecutionSettingsTable)
        .where(eq(orgExecutionSettingsTable.orgId, orgId))
        .get();
      if (!settings) {
        db.insert(orgExecutionSettingsTable)
          .values({
            orgId,
            defaultProfileId: LOCAL_EXECUTION_PROFILE_ID,
            updatedAt: now,
          })
          .run();
      } else if (!settings.defaultProfileId) {
        db.update(orgExecutionSettingsTable)
          .set({ defaultProfileId: LOCAL_EXECUTION_PROFILE_ID, updatedAt: now })
          .where(eq(orgExecutionSettingsTable.orgId, orgId))
          .run();
      }
      return {
        id: LOCAL_EXECUTION_PROFILE_ID,
        orgId,
        name: LOCAL_EXECUTION_PROFILE_NAME,
        system: true,
        nodeIds: fetchNodeIds(db, LOCAL_EXECUTION_PROFILE_ID),
        isolation: 'host',
        dockerImage: null,
      };
    });
  }

  countUsage(orgId: string, profileId: string): ProfileUsage {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const defaultProfileId = this.getDefault(orgId);
      const agentsResult = db
        .select({ count: sql<number>`count(*)` })
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.executionProfileId, profileId)))
        .get();
      const ruleRows = db
        .select({ actions: boardRulesTable.actions })
        .from(boardRulesTable)
        .where(eq(boardRulesTable.orgId, orgId))
        .all();
      let boardRules = 0;
      for (const row of ruleRows) {
        if (actionsUseProfile(row.actions, profileId)) {
          boardRules += 1;
        }
      }
      return {
        orgDefault: defaultProfileId === profileId,
        agents: agentsResult?.count ?? 0,
        boardRules,
      };
    });
  }
}

function actionsUseProfile(raw: string, profileId: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return false;
    }
    return parsed.some(
      (action) =>
        typeof action === 'object' &&
        action !== null &&
        (action as { type?: unknown }).type === 'assign_agent' &&
        (action as { executionProfileId?: unknown }).executionProfileId === profileId,
    );
  } catch {
    return false;
  }
}
