import { SQLiteError } from 'bun:sqlite';
import { and, eq, inArray } from 'drizzle-orm';
import {
  ExecutionProfileNameTakenException,
  ExecutionProfileNodeNotFoundException,
  ExecutionProfileNotFoundException,
  ExecutionProfileSystemException,
} from '../../domain/execution-profile/execution-profile.error.ts';
import type {
  ExecutionProfileIsolation,
  ExecutionProfileRecord,
  UpdateExecutionProfileInput,
} from '../../domain/execution-profile/execution-profile.ts';
import { nodes } from '../org-sqlite/org.schema.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { executionProfileNodesTable, executionProfilesTable } from '../org-sqlite/schema/index.ts';

const profileColumns = {
  id: executionProfilesTable.id,
  orgId: executionProfilesTable.orgId,
  name: executionProfilesTable.name,
  system: executionProfilesTable.system,
  isolation: executionProfilesTable.isolation,
  dockerImage: executionProfilesTable.dockerImage,
};

export function fetchNodeIds(db: OrgSqliteDb, profileId: string): string[] {
  return db
    .select({ nodeId: executionProfileNodesTable.nodeId })
    .from(executionProfileNodesTable)
    .where(eq(executionProfileNodesTable.profileId, profileId))
    .orderBy(executionProfileNodesTable.nodeId)
    .all()
    .map((row) => row.nodeId);
}

export function listProfiles(db: OrgSqliteDb, orgId: string): ExecutionProfileRecord[] {
  return db
    .select(profileColumns)
    .from(executionProfilesTable)
    .where(eq(executionProfilesTable.orgId, orgId))
    .orderBy(executionProfilesTable.name)
    .all()
    .map((row) => ({ ...row, nodeIds: fetchNodeIds(db, row.id) }));
}

export function fetchProfileById(
  db: OrgSqliteDb,
  orgId: string,
  profileId: string,
): ExecutionProfileRecord | undefined {
  const row = db
    .select(profileColumns)
    .from(executionProfilesTable)
    .where(and(eq(executionProfilesTable.orgId, orgId), eq(executionProfilesTable.id, profileId)))
    .get();
  return row ? { ...row, nodeIds: fetchNodeIds(db, row.id) } : undefined;
}

export function fetchProfileByName(
  db: OrgSqliteDb,
  orgId: string,
  name: string,
): ExecutionProfileRecord | undefined {
  const row = db
    .select(profileColumns)
    .from(executionProfilesTable)
    .where(
      and(
        eq(executionProfilesTable.orgId, orgId),
        eq(executionProfilesTable.normalizedName, normalizeName(name)),
      ),
    )
    .get();
  return row ? { ...row, nodeIds: fetchNodeIds(db, row.id) } : undefined;
}

export function assertProfileUpdatable(
  existing: ExecutionProfileRecord,
  input: UpdateExecutionProfileInput,
): void {
  if (!existing.system) {
    return;
  }
  if (input.isolation === 'container') {
    throw new ExecutionProfileSystemException('system profile cannot use container isolation');
  }
  if (input.name !== undefined) {
    throw new ExecutionProfileSystemException('cannot rename system profile');
  }
}

export function resolveProfileUpdate(
  existing: ExecutionProfileRecord,
  input: UpdateExecutionProfileInput,
): { name: string; isolation: ExecutionProfileIsolation; dockerImage: string | null } {
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const isolation = input.isolation ?? existing.isolation;
  const dockerImage =
    isolation === 'container' ? (input.dockerImage ?? existing.dockerImage) : null;
  return { name, isolation, dockerImage };
}

export function validateNodesBelongToOrg(db: OrgSqliteDb, _orgId: string, nodeIds: string[]): void {
  if (nodeIds.length === 0) {
    return;
  }
  const found = db.select({ id: nodes.id }).from(nodes).where(inArray(nodes.id, nodeIds)).all();
  const foundSet = new Set(found.map((row) => row.id));
  for (const nodeId of nodeIds) {
    if (!foundSet.has(nodeId)) {
      throw new ExecutionProfileNodeNotFoundException(nodeId);
    }
  }
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function mapProfileError(err: unknown): never {
  if (
    err instanceof ExecutionProfileNotFoundException ||
    err instanceof ExecutionProfileNameTakenException ||
    err instanceof ExecutionProfileNodeNotFoundException ||
    err instanceof ExecutionProfileSystemException
  ) {
    throw err;
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new ExecutionProfileNameTakenException('');
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_BUSY') {
    throw new ExecutionProfileNameTakenException('database busy, retry');
  }
  throw err;
}
