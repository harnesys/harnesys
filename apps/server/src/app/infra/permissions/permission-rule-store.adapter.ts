import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type {
  PermissionRuleEffect,
  PermissionRuleFilter,
  PermissionRuleKind,
  PermissionRuleRecord,
  ShellRulePatterns,
} from '../../domain/permissions/permission-rule-store.port.ts';
import {
  PermissionRuleStorePort,
  type PermissionRuleWriteInput,
} from '../../domain/permissions/permission-rule-store.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type PermissionRuleRow,
  permissionRulesTable,
} from '../org-sqlite/schema/permission-rules.ts';

@Injectable()
export class PermissionRuleStoreAdapter extends PermissionRuleStorePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(orgId: string, input: PermissionRuleWriteInput): PermissionRuleRecord {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.transaction((tx): PermissionRuleRecord => {
        const existing = tx
          .select()
          .from(permissionRulesTable)
          .where(
            and(
              eq(permissionRulesTable.kind, input.kind),
              eq(permissionRulesTable.pattern, input.pattern),
              eq(permissionRulesTable.effect, input.effect),
              input.agentId === null || input.agentId === undefined
                ? isNull(permissionRulesTable.agentId)
                : eq(permissionRulesTable.agentId, input.agentId),
              input.action === undefined
                ? isNull(permissionRulesTable.action)
                : eq(permissionRulesTable.action, input.action),
            ),
          )
          .get();
        if (existing) {
          return rowToRecord(existing);
        }
        const now = new Date().toISOString();
        const row = {
          id: randomUUID(),
          orgId,
          agentId: input.agentId ?? null,
          hostId: input.hostId ?? null,
          kind: input.kind,
          pattern: input.pattern,
          action: input.action ?? null,
          effect: input.effect,
          decidedBy: input.decidedBy ?? null,
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(permissionRulesTable).values(row).run();
        return rowToRecord(row);
      }),
    );
  }

  list(orgId: string, filter?: PermissionRuleFilter): PermissionRuleRecord[] {
    const agentScope = agentScopeOf(filter);
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(permissionRulesTable)
        .where(
          and(
            eq(permissionRulesTable.orgId, orgId),
            filter?.kind === undefined ? undefined : eq(permissionRulesTable.kind, filter.kind),
            agentScope,
          ),
        )
        .all();
      return rows.map(rowToRecord);
    });
  }

  revoke(orgId: string, ruleId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const deleted = db
        .delete(permissionRulesTable)
        .where(and(eq(permissionRulesTable.orgId, orgId), eq(permissionRulesTable.id, ruleId)))
        .returning({ id: permissionRulesTable.id })
        .all();
      return deleted.length > 0;
    });
  }

  hasOperation(orgId: string, agentId: string, operation: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ id: permissionRulesTable.id })
        .from(permissionRulesTable)
        .where(
          and(
            eq(permissionRulesTable.kind, 'op'),
            eq(permissionRulesTable.pattern, operation),
            eq(permissionRulesTable.effect, 'allow'),
            eq(permissionRulesTable.agentId, agentId),
          ),
        )
        .get();
      return row !== undefined;
    });
  }

  shellPatterns(orgId: string, agentId: string): ShellRulePatterns {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select({
          pattern: permissionRulesTable.pattern,
          effect: permissionRulesTable.effect,
        })
        .from(permissionRulesTable)
        .where(
          and(
            eq(permissionRulesTable.kind, 'shell-cmd'),
            or(eq(permissionRulesTable.agentId, agentId), isNull(permissionRulesTable.agentId)),
          ),
        )
        .all();
      const patterns: ShellRulePatterns = { allow: [], deny: [] };
      for (const row of rows) {
        if (row.effect === 'allow') {
          patterns.allow.push(row.pattern);
        } else {
          patterns.deny.push(row.pattern);
        }
      }
      return patterns;
    });
  }
}

function agentScopeOf(filter: PermissionRuleFilter | undefined): SQL | undefined {
  if (filter?.agentId === undefined) {
    return undefined;
  }
  if (filter.agentId === null) {
    return isNull(permissionRulesTable.agentId);
  }
  return or(eq(permissionRulesTable.agentId, filter.agentId), isNull(permissionRulesTable.agentId));
}

function rowToRecord(row: PermissionRuleRow): PermissionRuleRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    agentId: row.agentId ?? null,
    hostId: row.hostId ?? null,
    kind: row.kind as PermissionRuleKind,
    pattern: row.pattern,
    action: row.action === null ? null : (row.action as 'read' | 'edit'),
    effect: row.effect as PermissionRuleEffect,
    decidedBy: row.decidedBy ?? null,
    createdAt: row.createdAt,
  };
}
