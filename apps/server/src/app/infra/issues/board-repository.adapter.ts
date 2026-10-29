import { Injectable } from '@harnesys/brix';
import type { BoardStatus, BoardStatusInput } from '@harnesys/contracts';
import { and, asc, eq } from 'drizzle-orm';
import {
  BoardValidationException,
  RuleValidationException,
  StatusNotEmptyException,
} from '../../domain/issue/board.error.ts';
import type {
  BoardRuleRecord,
  BoardRuleWrite,
  IssueBoardInsert,
  IssueBoardPatch,
  IssueBoardRecord,
} from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { validateStatuses } from '../../domain/issue/board-validation.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type BoardRuleRow,
  boardRulesTable,
  boardStatusesTable,
  type IssueBoardRow,
  issueBoardsTable,
  issuesTable,
} from '../org-sqlite/schema/index.ts';
import { assertExactOrder } from './board-order.ts';
import { assertRuleStatusRefs, toRuleRecord, triggerPayload } from './board-rule-mapper.ts';
import {
  applyEntryExclusive,
  assertImmutableKey,
  buildStatus,
  entryKeyOf,
  mergeStatus,
  requireStatus,
  toStatus,
  toStatusPatch,
  toStatusRow,
} from './board-status-mapper.ts';

@Injectable()
export class IssueBoardRepositoryAdapter extends IssueBoardRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): IssueBoardRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(issueBoardsTable)
        .where(eq(issueBoardsTable.orgId, orgId))
        .orderBy(asc(issueBoardsTable.createdAt))
        .all()
        .map((row) => hydrate(db, row)),
    );
  }

  findById(orgId: string, id: string): IssueBoardRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(issueBoardsTable)
        .where(and(eq(issueBoardsTable.orgId, orgId), eq(issueBoardsTable.id, id)))
        .get();
      return row ? hydrate(db, row) : undefined;
    });
  }

  insert(rec: IssueBoardInsert): IssueBoardRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) =>
      db.transaction((tx) => {
        const row = tx.insert(issueBoardsTable).values(toBoardRow(rec)).returning().get();
        if (!row) {
          throw new BoardValidationException([{ field: 'statuses', code: 'too-few' }]);
        }
        for (const status of rec.statuses) {
          tx.insert(boardStatusesTable).values(toStatusRow(rec.id, status)).run();
        }
        return hydrate(tx, row);
      }),
    );
  }

  update(orgId: string, id: string, patch: IssueBoardPatch): IssueBoardRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .update(issueBoardsTable)
        .set(patch)
        .where(and(eq(issueBoardsTable.orgId, orgId), eq(issueBoardsTable.id, id)))
        .returning()
        .get();
      if (!row) {
        throw new BoardValidationException([{ field: 'statuses', code: 'too-few' }]);
      }
      return hydrate(db, row);
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(issueBoardsTable)
        .where(and(eq(issueBoardsTable.orgId, orgId), eq(issueBoardsTable.id, id)))
        .run();
    });
  }

  addStatus(orgId: string, boardId: string, input: BoardStatusInput): BoardStatus {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const current = loadStatuses(tx, boardId);
        const status = buildStatus(current, input);
        const next = applyEntryExclusive([...current, status], entryKeyOf(status));
        assertValid(next);
        tx.insert(boardStatusesTable).values(toStatusRow(boardId, status)).run();
        persistEntrySwaps(tx, boardId, next);
        return status;
      }),
    );
  }

  updateStatus(orgId: string, boardId: string, key: string, input: BoardStatusInput): BoardStatus {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const current = loadStatuses(tx, boardId);
        const existing = requireStatus(current, key);
        assertImmutableKey(input, key);
        const merged = mergeStatus(existing, input);
        const next = applyEntryExclusive(
          current.map((status) => (status.key === key ? merged : status)),
          entryKeyOf(merged),
        );
        assertValid(next);
        tx.update(boardStatusesTable)
          .set(toStatusPatch(merged))
          .where(and(eq(boardStatusesTable.boardId, boardId), eq(boardStatusesTable.key, key)))
          .run();
        persistEntrySwaps(tx, boardId, next);
        return merged;
      }),
    );
  }

  removeStatus(orgId: string, boardId: string, key: string): void {
    withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const current = loadStatuses(tx, boardId);
        requireStatus(current, key);
        const remaining = current.filter((status) => status.key !== key);
        const issueCount = tx
          .select({ id: issuesTable.id })
          .from(issuesTable)
          .where(
            and(
              eq(issuesTable.orgId, orgId),
              eq(issuesTable.boardId, boardId),
              eq(issuesTable.statusKey, key),
            ),
          )
          .all().length;
        if (issueCount > 0) {
          throw new StatusNotEmptyException(key, issueCount);
        }
        assertValid(remaining);
        tx.delete(boardStatusesTable)
          .where(and(eq(boardStatusesTable.boardId, boardId), eq(boardStatusesTable.key, key)))
          .run();
      }),
    );
  }

  reorderStatuses(orgId: string, boardId: string, order: string[]): void {
    withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const current = loadStatuses(tx, boardId).map((status) => status.key);
        assertExactOrder(current, order, 'statuses');
        order.forEach((key, index) => {
          tx.update(boardStatusesTable)
            .set({ order: index })
            .where(and(eq(boardStatusesTable.boardId, boardId), eq(boardStatusesTable.key, key)))
            .run();
        });
      }),
    );
  }

  saveRule(orgId: string, boardId: string, input: BoardRuleWrite): BoardRuleRecord {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const statuses = loadStatuses(tx, boardId);
        assertRuleStatusRefs(statuses, input);
        const now = new Date().toISOString();
        if (input.id !== undefined) {
          const existing = tx
            .select()
            .from(boardRulesTable)
            .where(and(eq(boardRulesTable.orgId, orgId), eq(boardRulesTable.id, input.id)))
            .get();
          if (!existing || existing.boardId !== boardId) {
            throw new RuleValidationException(`unknown rule: ${input.id}`);
          }
          tx.update(boardRulesTable)
            .set({
              triggerType: input.trigger.type,
              triggerPayload: JSON.stringify(triggerPayload(input.trigger)),
              conditions: JSON.stringify(input.conditions),
              actions: JSON.stringify(input.actions),
              position: input.position,
              enabled: input.enabled,
              createdByUserId: input.createdByUserId ?? existing.createdByUserId,
              updatedAt: now,
            })
            .where(eq(boardRulesTable.id, input.id))
            .run();
          return toRuleRecord({
            ...existing,
            triggerType: input.trigger.type,
            triggerPayload: JSON.stringify(triggerPayload(input.trigger)),
            conditions: JSON.stringify(input.conditions),
            actions: JSON.stringify(input.actions),
            position: input.position,
            enabled: input.enabled,
            createdByUserId: input.createdByUserId ?? existing.createdByUserId,
            updatedAt: now,
          });
        }
        const row: BoardRuleRow = {
          id: crypto.randomUUID(),
          orgId,
          boardId,
          triggerType: input.trigger.type,
          triggerPayload: JSON.stringify(triggerPayload(input.trigger)),
          conditions: JSON.stringify(input.conditions),
          actions: JSON.stringify(input.actions),
          position: input.position,
          enabled: input.enabled,
          createdByUserId: input.createdByUserId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(boardRulesTable).values(row).run();
        return toRuleRecord(row);
      }),
    );
  }

  removeRule(orgId: string, boardId: string, ruleId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(boardRulesTable)
        .where(and(eq(boardRulesTable.orgId, orgId), eq(boardRulesTable.id, ruleId)))
        .get();
      if (!existing || existing.boardId !== boardId) {
        throw new RuleValidationException(`unknown rule: ${ruleId}`);
      }
      db.delete(boardRulesTable).where(eq(boardRulesTable.id, ruleId)).run();
    });
  }

  reorderRules(orgId: string, boardId: string, order: string[]): void {
    withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx) => {
        const current = tx
          .select({ id: boardRulesTable.id })
          .from(boardRulesTable)
          .where(eq(boardRulesTable.boardId, boardId))
          .all()
          .map((row) => row.id);
        assertExactOrder(current, order, 'rules');
        order.forEach((id, index) => {
          tx.update(boardRulesTable)
            .set({ position: index })
            .where(and(eq(boardRulesTable.orgId, orgId), eq(boardRulesTable.id, id)))
            .run();
        });
      }),
    );
  }
}

function hydrate(db: OrgSqliteDb, row: IssueBoardRow): IssueBoardRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    status: row.status,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    statuses: loadStatuses(db, row.id),
    rules: db
      .select()
      .from(boardRulesTable)
      .where(eq(boardRulesTable.boardId, row.id))
      .orderBy(asc(boardRulesTable.position), asc(boardRulesTable.createdAt))
      .all()
      .map(toRuleRecord),
  };
}

function loadStatuses(db: OrgSqliteDb, boardId: string): BoardStatus[] {
  return db
    .select()
    .from(boardStatusesTable)
    .where(eq(boardStatusesTable.boardId, boardId))
    .orderBy(asc(boardStatusesTable.order), asc(boardStatusesTable.key))
    .all()
    .map(toStatus);
}

function toBoardRow(rec: IssueBoardInsert) {
  return {
    id: rec.id,
    orgId: rec.orgId,
    name: rec.name,
    description: rec.description,
    color: rec.color,
    icon: rec.icon,
    status: rec.status,
    archivedAt: rec.archivedAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function persistEntrySwaps(db: OrgSqliteDb, boardId: string, statuses: BoardStatus[]): void {
  for (const status of statuses) {
    db.update(boardStatusesTable)
      .set({ isEntry: status.isEntry })
      .where(and(eq(boardStatusesTable.boardId, boardId), eq(boardStatusesTable.key, status.key)))
      .run();
  }
}

function assertValid(statuses: BoardStatus[]): void {
  const issues = validateStatuses(statuses);
  if (issues.length > 0) {
    throw new BoardValidationException(issues);
  }
}
