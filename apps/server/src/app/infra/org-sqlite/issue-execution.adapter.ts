import { Injectable } from '@harnesys/brix';
import { and, eq, inArray } from 'drizzle-orm';
import {
  IssueExecutionPort,
  type ReserveIssueExecutionInput,
} from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution, IssueExecutionState } from '../../domain/issue/issue-execution.ts';
import { ISSUE_EXECUTION_ACTIVE_STATES } from '../../domain/issue/issue-execution.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from './org-sqlite-session.ts';
import { issueExecutionsTable } from './schema/index.ts';

@Injectable()
export class IssueExecutionAdapter extends IssueExecutionPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  findById(orgId: string, id: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .get();
      return row ? mapRow(row) : null;
    });
  }

  findActiveByIssue(orgId: string, issueId: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(
          and(
            eq(issueExecutionsTable.orgId, orgId),
            eq(issueExecutionsTable.issueId, issueId),
            inArray(issueExecutionsTable.state, [...ISSUE_EXECUTION_ACTIVE_STATES]),
          ),
        )
        .get();
      return row ? mapRow(row) : null;
    });
  }

  findByCorrelationId(orgId: string, correlationId: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(
          and(
            eq(issueExecutionsTable.orgId, orgId),
            eq(issueExecutionsTable.correlationId, correlationId),
          ),
        )
        .get();
      return row ? mapRow(row) : null;
    });
  }

  findByRunId(orgId: string, runId: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.runId, runId)))
        .get();
      return row ? mapRow(row) : null;
    });
  }

  listActive(orgId: string): IssueExecution[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueExecutionsTable)
        .where(
          and(
            eq(issueExecutionsTable.orgId, orgId),
            inArray(issueExecutionsTable.state, [...ISSUE_EXECUTION_ACTIVE_STATES]),
          ),
        )
        .all()
        .map(mapRow),
    );
  }

  reserve(input: ReserveIssueExecutionInput): IssueExecution {
    return withOrgSqlite(this.layout, input.orgId, (db) => {
      try {
        db.insert(issueExecutionsTable)
          .values({
            id: input.id,
            orgId: input.orgId,
            issueId: input.issueId,
            runId: null,
            agentId: input.agentId,
            worktreeId: input.worktreeId ?? null,
            correlationId: input.correlationId,
            leaseEpoch: 1,
            state: 'reserved',
            requestedStatus: input.requestedStatus,
            ruleId: input.ruleId ?? null,
            profileId: input.profileId ?? null,
            createdAt: input.createdAt,
            updatedAt: input.updatedAt,
          })
          .run();
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        const recovered = findActiveReservation(
          db,
          input.orgId,
          input.issueId,
          input.correlationId,
        );
        if (recovered) {
          return recovered;
        }
        throw err;
      }
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(
          and(eq(issueExecutionsTable.orgId, input.orgId), eq(issueExecutionsTable.id, input.id)),
        )
        .get();
      if (!row) {
        throw new Error('issue execution missing after reserve');
      }
      return mapRow(row);
    });
  }

  setWorktree(
    orgId: string,
    id: string,
    worktreeId: string,
    updatedAt: string,
  ): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(issueExecutionsTable)
        .set({ worktreeId, updatedAt })
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .run();
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .get();
      return row ? mapRow(row) : null;
    });
  }

  activate(orgId: string, id: string, runId: string, updatedAt: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(issueExecutionsTable)
        .set({ runId, state: 'active', updatedAt })
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .run();
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .get();
      return row ? mapRow(row) : null;
    });
  }

  setState(
    orgId: string,
    id: string,
    state: IssueExecutionState,
    updatedAt: string,
  ): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(issueExecutionsTable)
        .set({ state, updatedAt })
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .run();
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, id)))
        .get();
      return row ? mapRow(row) : null;
    });
  }

  release(orgId: string, id: string, updatedAt: string): IssueExecution | null {
    return this.setState(orgId, id, 'released', updatedAt);
  }

  releaseByRunId(orgId: string, runId: string, updatedAt: string): IssueExecution | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.runId, runId)))
        .get();
      if (!existing) {
        return null;
      }
      db.update(issueExecutionsTable)
        .set({ state: 'released', updatedAt })
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, existing.id)))
        .run();
      const row = db
        .select()
        .from(issueExecutionsTable)
        .where(and(eq(issueExecutionsTable.orgId, orgId), eq(issueExecutionsTable.id, existing.id)))
        .get();
      return row ? mapRow(row) : null;
    });
  }
}

function findActiveReservation(
  db: OrgSqliteDb,
  orgId: string,
  issueId: string,
  correlationId: string,
): IssueExecution | null {
  const byCorrelation = db
    .select()
    .from(issueExecutionsTable)
    .where(
      and(
        eq(issueExecutionsTable.orgId, orgId),
        eq(issueExecutionsTable.correlationId, correlationId),
        inArray(issueExecutionsTable.state, [...ISSUE_EXECUTION_ACTIVE_STATES]),
      ),
    )
    .get();
  if (byCorrelation) {
    return mapRow(byCorrelation);
  }
  const byIssue = db
    .select()
    .from(issueExecutionsTable)
    .where(
      and(
        eq(issueExecutionsTable.orgId, orgId),
        eq(issueExecutionsTable.issueId, issueId),
        inArray(issueExecutionsTable.state, [...ISSUE_EXECUTION_ACTIVE_STATES]),
      ),
    )
    .get();
  return byIssue ? mapRow(byIssue) : null;
}

function mapRow(row: typeof issueExecutionsTable.$inferSelect): IssueExecution {
  return {
    id: row.id,
    orgId: row.orgId,
    issueId: row.issueId,
    runId: row.runId,
    agentId: row.agentId,
    worktreeId: row.worktreeId,
    correlationId: row.correlationId,
    leaseEpoch: row.leaseEpoch,
    state: row.state as IssueExecutionState,
    requestedStatus: row.requestedStatus,
    ruleId: row.ruleId,
    profileId: row.profileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.includes('CONSTRAINT')
  );
}
