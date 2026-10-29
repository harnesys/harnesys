import { SQLiteError } from 'bun:sqlite';
import { and, asc, eq } from 'drizzle-orm';
import { PROMOTION_MARKER } from 'harnesys';
import { MemoryConflictException } from '../../domain/agent/agent-memory.error.ts';
import type {
  PromotionDecision,
  PromotionFactRow,
  PromotionPendingInput,
} from '../../domain/agent/agent-memory.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { memoryFactsTable, memoryPromotionsTable } from '../org-sqlite/schema/agent-memory.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';

export type PromotionStatus = 'pending' | PromotionDecision;

export class OrgMemoryPromotionStore {
  constructor(private readonly db: OrgSqliteDb) {}

  insertPending(input: PromotionPendingInput): void {
    this.db
      .insert(memoryPromotionsTable)
      .values({
        id: input.id,
        orgId: input.orgId,
        agentName: input.agentName,
        factId: input.factId,
        status: 'pending',
        createdAt: input.createdAt,
      })
      .onConflictDoNothing()
      .run();
  }

  deletePendingByFact(orgId: string, agentName: string, factId: string): void {
    this.db
      .delete(memoryPromotionsTable)
      .where(
        and(
          eq(memoryPromotionsTable.orgId, orgId),
          eq(memoryPromotionsTable.agentName, agentName),
          eq(memoryPromotionsTable.factId, factId),
          eq(memoryPromotionsTable.status, 'pending'),
        ),
      )
      .run();
  }

  pendingOf(orgId: string, agentName: string): PromotionFactRow[] {
    return this.db
      .select({
        id: memoryPromotionsTable.id,
        factId: memoryPromotionsTable.factId,
        text: memoryFactsTable.text,
        createdAt: memoryPromotionsTable.createdAt,
      })
      .from(memoryPromotionsTable)
      .innerJoin(memoryFactsTable, eq(memoryFactsTable.id, memoryPromotionsTable.factId))
      .where(
        and(
          eq(memoryPromotionsTable.orgId, orgId),
          eq(memoryPromotionsTable.agentName, agentName),
          eq(memoryPromotionsTable.status, 'pending'),
        ),
      )
      .orderBy(asc(memoryPromotionsTable.createdAt), asc(memoryPromotionsTable.id))
      .all();
  }

  setStatus(
    orgId: string,
    id: string,
    status: PromotionDecision,
    decidedAt: string,
    decidedBy: string,
  ): void {
    this.db
      .update(memoryPromotionsTable)
      .set({ status, decidedAt, decidedBy })
      .where(and(eq(memoryPromotionsTable.id, id), eq(memoryPromotionsTable.orgId, orgId)))
      .run();
  }

  appendInstructionBlock(orgId: string, agentName: string, block: string): boolean {
    try {
      return this.db.transaction((tx) => {
        const row = tx
          .select({ instructions: agentsTable.instructions })
          .from(agentsTable)
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.name, agentName)))
          .get();
        if (row === undefined || instructionBlockPresent(row.instructions, block)) {
          return false;
        }
        const next = row.instructions.length === 0 ? block : `${row.instructions}\n\n${block}`;
        tx.update(agentsTable)
          .set({ instructions: next, updatedAt: new Date().toISOString() })
          .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.name, agentName)))
          .run();
        return true;
      });
    } catch (err) {
      if (
        err instanceof SQLiteError &&
        typeof err.code === 'string' &&
        err.code.startsWith('SQLITE_BUSY')
      ) {
        throw new MemoryConflictException('database busy, retry promotion approval');
      }
      throw err;
    }
  }
}

function instructionBlockPresent(instructions: string, block: string): boolean {
  const rest = block.slice(PROMOTION_MARKER.length);
  if (!block.startsWith(PROMOTION_MARKER) || rest.length === 0) {
    return instructions.includes(block);
  }
  const end = rest.indexOf(' ');
  const id = end === -1 ? undefined : rest.slice(0, end);
  return id === undefined
    ? instructions.includes(block)
    : instructions.includes(`${PROMOTION_MARKER}${id} `);
}
