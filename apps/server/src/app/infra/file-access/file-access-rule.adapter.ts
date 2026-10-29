import { Injectable } from '@harnesys/brix';
import { and, eq, isNull, or } from 'drizzle-orm';
import { FileRuleNotFoundException } from '../../domain/file-access/file-access.error.ts';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import type { FileRuleInsert, FileRuleRecord } from '../../domain/file-access/file-access-rule.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type FileRuleRow, fileAccessRulesTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class FileAccessRuleAdapter extends FileAccessRulePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): FileRuleRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(fileAccessRulesTable)
        .where(eq(fileAccessRulesTable.orgId, orgId))
        .all()
        .map(toRecord),
    );
  }

  listForAgent(orgId: string, agentId: string): FileRuleRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(fileAccessRulesTable)
        .where(
          and(
            eq(fileAccessRulesTable.orgId, orgId),
            or(eq(fileAccessRulesTable.agentId, agentId), isNull(fileAccessRulesTable.agentId)),
          ),
        )
        .all()
        .map(toRecord),
    );
  }

  insert(rule: FileRuleInsert): FileRuleRecord {
    return withOrgSqlite(this.layout, rule.orgId, (db) => {
      const now = new Date().toISOString();
      const row = db
        .insert(fileAccessRulesTable)
        .values({
          id: crypto.randomUUID(),
          orgId: rule.orgId,
          agentId: rule.agentId,
          hostId: rule.hostId,
          pathPattern: rule.pathPattern,
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
      const existing = db
        .select({ id: fileAccessRulesTable.id })
        .from(fileAccessRulesTable)
        .where(and(eq(fileAccessRulesTable.orgId, orgId), eq(fileAccessRulesTable.id, ruleId)))
        .get();
      if (!existing) {
        throw new FileRuleNotFoundException(ruleId);
      }
      db.delete(fileAccessRulesTable)
        .where(and(eq(fileAccessRulesTable.orgId, orgId), eq(fileAccessRulesTable.id, ruleId)))
        .run();
    });
  }
}

function toRecord(row: FileRuleRow): FileRuleRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    agentId: row.agentId ?? null,
    hostId: row.hostId ?? null,
    pathPattern: row.pathPattern,
    action: row.action as 'read' | 'edit',
    effect: row.effect as 'allow' | 'deny',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
