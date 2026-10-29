import { Injectable } from '@harnesys/brix';
import type { IssueFireTrailEntry, IssuePriority } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import type { IssueInsert, IssuePatch, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { resolveIssueBranch } from '../../domain/issue/issue-worktree-binding.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type IssueInsertRow, type IssueRow, issuesTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class IssueRepositoryAdapter extends IssueRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): IssueRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(issuesTable).where(eq(issuesTable.orgId, orgId)).all().map(toIssue),
    );
  }

  findById(orgId: string, id: string): IssueRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issuesTable)
        .where(and(eq(issuesTable.orgId, orgId), eq(issuesTable.id, id)))
        .get();
      return row ? toIssue(row) : undefined;
    });
  }

  listChildren(orgId: string, parentIssueId: string): IssueRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issuesTable)
        .where(and(eq(issuesTable.orgId, orgId), eq(issuesTable.parentIssueId, parentIssueId)))
        .all()
        .map(toIssue),
    );
  }

  insert(rec: IssueInsert): IssueRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      const row = db.insert(issuesTable).values(toRow(rec)).returning().get();
      return toIssue(row);
    });
  }

  update(orgId: string, id: string, patch: IssuePatch): IssueRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const { labels, fireTrail, ...rest } = patch;
      const rowPatch: Record<string, unknown> = { ...rest };
      if (labels !== undefined) {
        rowPatch.labels = JSON.stringify(labels);
      }
      if (fireTrail !== undefined) {
        rowPatch.fireTrail = JSON.stringify(fireTrail);
      }
      if (rest.branch === null) {
        rowPatch.worktreeBaseBranch = null;
      }
      const row = db
        .update(issuesTable)
        .set(rowPatch)
        .where(and(eq(issuesTable.orgId, orgId), eq(issuesTable.id, id)))
        .returning()
        .get();
      if (!row) {
        throw new IssueNotFoundException(id);
      }
      return toIssue(row);
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issuesTable)
        .where(and(eq(issuesTable.orgId, orgId), eq(issuesTable.id, id)))
        .run();
    });
  }

  clearLabelFromAll(orgId: string, labelId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select({ id: issuesTable.id, labels: issuesTable.labels })
        .from(issuesTable)
        .where(eq(issuesTable.orgId, orgId))
        .all();
      for (const row of rows) {
        const labels = parseLabels(row.labels);
        if (!labels.includes(labelId)) {
          continue;
        }
        const next = JSON.stringify(labels.filter((item) => item !== labelId));
        db.update(issuesTable).set({ labels: next }).where(eq(issuesTable.id, row.id)).run();
      }
    });
  }
}

export function parseLabels(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function parseFireTrail(raw: string): IssueFireTrailEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is IssueFireTrailEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as IssueFireTrailEntry).agentId === 'string' &&
        typeof (item as IssueFireTrailEntry).statusKey === 'string' &&
        typeof (item as IssueFireTrailEntry).reason === 'string' &&
        typeof (item as IssueFireTrailEntry).at === 'string',
    );
  } catch {
    return [];
  }
}

export function toIssue(row: IssueRow): IssueRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    boardId: row.boardId,
    title: row.title,
    description: row.description,
    statusKey: row.statusKey,
    priority: row.priority as IssuePriority,
    type: row.type,
    assigneeAgentId: row.assigneeAgentId,
    labels: parseLabels(row.labels),
    parentIssueId: row.parentIssueId,
    dueDate: row.dueDate,
    closedAt: row.closedAt,
    fireTrail: parseFireTrail(row.fireTrail),
    sourceId: row.sourceId ?? null,
    branch: resolveIssueBranch(row),
    worktreeOnStatus: row.worktreeOnStatus ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(rec: IssueInsert): IssueInsertRow {
  return {
    id: rec.id,
    orgId: rec.orgId,
    boardId: rec.boardId,
    title: rec.title,
    description: rec.description,
    statusKey: rec.statusKey,
    priority: rec.priority,
    type: rec.type,
    assigneeAgentId: rec.assigneeAgentId,
    labels: JSON.stringify(rec.labels),
    parentIssueId: rec.parentIssueId,
    dueDate: rec.dueDate,
    closedAt: rec.closedAt,
    fireTrail: JSON.stringify(rec.fireTrail),
    sourceId: rec.sourceId,
    branch: rec.branch,
    worktreeOnStatus: rec.worktreeOnStatus,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}
