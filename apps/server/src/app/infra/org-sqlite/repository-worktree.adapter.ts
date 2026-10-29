import { Injectable } from '@harnesys/brix';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  RepositoryWorktreePort,
  type UpsertRepositoryWorktreeInput,
} from '../../domain/source/repository-worktree.port.ts';
import type {
  RepositoryWorktree,
  RepositoryWorktreeState,
} from '../../domain/source/repository-worktree.ts';
import { isActiveWorktreeState } from '../../domain/source/repository-worktree.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { repositoryWorktreesTable } from './schema/index.ts';

@Injectable()
export class RepositoryWorktreeAdapter extends RepositoryWorktreePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  findById(orgId: string, worktreeId: string): RepositoryWorktree | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.id, worktreeId),
          ),
        )
        .get();
      return row ? mapRow(row) : null;
    });
  }

  findByOperationId(orgId: string, operationId: string): RepositoryWorktree | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.operationId, operationId),
          ),
        )
        .get();
      return row ? mapRow(row) : null;
    });
  }

  findActiveByBranch(
    orgId: string,
    sourceId: string,
    hostId: string,
    branch: string,
  ): RepositoryWorktree | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.sourceId, sourceId),
            eq(repositoryWorktreesTable.hostId, hostId),
            eq(repositoryWorktreesTable.branch, branch),
            inArray(repositoryWorktreesTable.state, ['creating', 'ready', 'removing']),
          ),
        )
        .all();
      const active = rows.find((row) =>
        isActiveWorktreeState(row.state as RepositoryWorktreeState),
      );
      return active ? mapRow(active) : null;
    });
  }

  listCreating(orgId: string): RepositoryWorktree[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.state, 'creating'),
          ),
        )
        .all()
        .map(mapRow),
    );
  }

  listForSource(orgId: string, sourceId: string): RepositoryWorktree[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.sourceId, sourceId),
            ne(repositoryWorktreesTable.state, 'failed'),
          ),
        )
        .all()
        .map(mapRow),
    );
  }

  listForHost(orgId: string, sourceId: string, hostId: string): RepositoryWorktree[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.sourceId, sourceId),
            eq(repositoryWorktreesTable.hostId, hostId),
          ),
        )
        .all()
        .map(mapRow),
    );
  }

  listForIssue(orgId: string, issueId: string): RepositoryWorktree[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.issueId, issueId),
            ne(repositoryWorktreesTable.state, 'failed'),
          ),
        )
        .all()
        .map(mapRow),
    );
  }

  upsert(input: UpsertRepositoryWorktreeInput): RepositoryWorktree {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      const existing = db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, input.orgId),
            eq(repositoryWorktreesTable.id, input.id),
          ),
        )
        .get();
      const values = {
        id: input.id,
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        branch: input.branch,
        baseCommit: input.baseCommit ?? null,
        state: input.state,
        activeRunId: input.activeRunId ?? null,
        operationId: input.operationId,
        issueId: input.issueId ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      if (existing) {
        db.update(repositoryWorktreesTable)
          .set(values)
          .where(
            and(
              eq(repositoryWorktreesTable.orgId, input.orgId),
              eq(repositoryWorktreesTable.id, input.id),
            ),
          )
          .run();
      } else {
        db.insert(repositoryWorktreesTable).values(values).run();
      }
      const saved = db
        .select()
        .from(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, input.orgId),
            eq(repositoryWorktreesTable.id, input.id),
          ),
        )
        .get();
      return saved ? mapRow(saved) : mapRow(values);
    });
  }

  setState(
    orgId: string,
    worktreeId: string,
    patch: {
      state: RepositoryWorktreeState;
      baseCommit?: string | null;
      lastErrorCode?: string | null;
      updatedAt: string;
    },
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(repositoryWorktreesTable)
        .set({
          state: patch.state,
          ...(patch.baseCommit !== undefined ? { baseCommit: patch.baseCommit } : {}),
          ...(patch.lastErrorCode !== undefined ? { lastErrorCode: patch.lastErrorCode } : {}),
          updatedAt: patch.updatedAt,
        })
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.id, worktreeId),
          ),
        )
        .run();
    });
  }

  setActiveRunId(
    orgId: string,
    worktreeId: string,
    activeRunId: string | null,
    updatedAt: string,
  ): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(repositoryWorktreesTable)
        .set({ activeRunId, updatedAt })
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.id, worktreeId),
          ),
        )
        .run();
    });
  }

  clearActiveRun(orgId: string, runId: string, updatedAt: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(repositoryWorktreesTable)
        .set({ activeRunId: null, updatedAt })
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.activeRunId, runId),
          ),
        )
        .run();
    });
  }

  remove(orgId: string, worktreeId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(repositoryWorktreesTable)
        .where(
          and(
            eq(repositoryWorktreesTable.orgId, orgId),
            eq(repositoryWorktreesTable.id, worktreeId),
          ),
        )
        .run();
    });
  }
}

function mapRow(row: {
  id: string;
  orgId: string;
  sourceId: string;
  hostId: string;
  branch: string;
  baseCommit: string | null;
  state: string;
  activeRunId: string | null;
  operationId: string;
  issueId: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}): RepositoryWorktree {
  return {
    id: row.id,
    orgId: row.orgId,
    sourceId: row.sourceId,
    hostId: row.hostId,
    branch: row.branch,
    baseCommit: row.baseCommit,
    state: row.state as RepositoryWorktreeState,
    activeRunId: row.activeRunId,
    operationId: row.operationId,
    issueId: row.issueId,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
