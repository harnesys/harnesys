import { and, asc, desc, eq } from 'drizzle-orm';
import type { MemoryScopeId, PinPort, PinRecord, PinSource, PinUpsertInput } from 'harnesys';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { type MemoryPinRow, memoryPinsTable } from '../../org-sqlite/schema/agent-memory.ts';

export class OrgPinPort implements PinPort {
  constructor(private readonly db: OrgSqliteDb) {}

  list(scope: MemoryScopeId): Promise<PinRecord[]> {
    return Promise.resolve(this.readPins(scope));
  }

  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord> {
    const updatedAt = new Date().toISOString();
    this.db
      .insert(memoryPinsTable)
      .values({
        orgId: scope.orgId,
        agentName: scope.agentName,
        key: input.key,
        text: input.text,
        source: input.source,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [memoryPinsTable.orgId, memoryPinsTable.agentName, memoryPinsTable.key],
        set: { text: input.text, source: input.source, updatedAt },
      })
      .run();
    return Promise.resolve({ key: input.key, text: input.text, updatedAt, source: input.source });
  }

  remove(scope: MemoryScopeId, key: string): Promise<void> {
    this.db
      .delete(memoryPinsTable)
      .where(
        and(
          eq(memoryPinsTable.orgId, scope.orgId),
          eq(memoryPinsTable.agentName, scope.agentName),
          eq(memoryPinsTable.key, key),
        ),
      )
      .run();
    return Promise.resolve();
  }

  projectForWindow(scope: MemoryScopeId, budgetTokens: number): Promise<string> {
    const lines: string[] = [];
    let spent = 0;
    for (const pin of this.readPins(scope)) {
      const cost = Math.ceil(pin.text.length / 4);
      if (spent + cost > budgetTokens) {
        break;
      }
      spent += cost;
      lines.push(pin.text);
    }
    return Promise.resolve(lines.join('\n'));
  }

  private readPins(scope: MemoryScopeId): PinRecord[] {
    const rows = this.db
      .select()
      .from(memoryPinsTable)
      .where(
        and(eq(memoryPinsTable.orgId, scope.orgId), eq(memoryPinsTable.agentName, scope.agentName)),
      )
      .orderBy(desc(memoryPinsTable.updatedAt), asc(memoryPinsTable.key))
      .all();
    return rows.map(toPinRecord);
  }
}

function toPinRecord(row: MemoryPinRow): PinRecord {
  return {
    key: row.key,
    text: row.text,
    updatedAt: row.updatedAt,
    source: toPinSource(row.source),
  };
}

function toPinSource(value: string): PinSource {
  return value === 'human' ? 'human' : 'agent';
}
