import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { FileRuleNotFoundException } from '../../domain/file-access/file-access.error.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleInsert, FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type PermissionRuleRow,
  permissionRulesTable,
} from '../org-sqlite/schema/permission-rules.ts';

/**
 * File-path slice of the unified permission_rules store. Every durable exception
 * (fs-path, shell-cmd, op) lives in one table; this port keeps the file gate API.
 */
@Injectable()
export class FileAccessRuleAdapter extends FileAccessRulePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): FileRuleRecord[] {
    return this.read(orgId, and(eq(permissionRulesTable.orgId, orgId)));
  }

  listForAgent(orgId: string, agentId: string): FileRuleRecord[] {
    return this.read(
      orgId,
      and(
        eq(permissionRulesTable.orgId, orgId),
        or(eq(permissionRulesTable.agentId, agentId), isNull(permissionRulesTable.agentId)),
      ),
    );
  }

  insert(rule: FileRuleInsert): FileRuleRecord {
    return withOrgSqlite(this.layout, rule.orgId, (db) => {
      const now = new Date().toISOString();
      const row = db
        .insert(permissionRulesTable)
        .values({
          id: randomUUID(),
          orgId: rule.orgId,
          agentId: rule.agentId,
          hostId: rule.hostId,
          kind: 'fs-path',
          pattern: rule.pathPattern,
          action: rule.action,
          effect: rule.effect,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return toRecord(row);
    });
  }

  remove(orgId: string, ruleId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const scope = and(
        eq(permissionRulesTable.orgId, orgId),
        eq(permissionRulesTable.id, ruleId),
        eq(permissionRulesTable.kind, 'fs-path'),
      );
      const existing = db
        .select({ id: permissionRulesTable.id })
        .from(permissionRulesTable)
        .where(scope)
        .get();
      if (!existing) {
        throw new FileRuleNotFoundException(ruleId);
      }
      db.delete(permissionRulesTable).where(scope).run();
    });
  }

  private read(orgId: string, where: SQL | undefined): FileRuleRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(permissionRulesTable)
        .where(and(where, eq(permissionRulesTable.kind, 'fs-path')))
        .all()
        .map(toRecord),
    );
  }
}

function toRecord(row: PermissionRuleRow): FileRuleRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    agentId: row.agentId ?? null,
    hostId: row.hostId ?? null,
    pathPattern: row.pattern,
    action: (row.action ?? 'read') as 'read' | 'edit',
    effect: row.effect as 'allow' | 'deny',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
