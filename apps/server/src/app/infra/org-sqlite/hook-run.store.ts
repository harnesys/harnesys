import type { AgentHookEffect, AgentHookEvent, HookRun } from '@harnesys/contracts';
import { HookEffectSchema, HookEventNameSchema, HookRunStatusSchema } from '@harnesys/contracts';
import { desc, eq } from 'drizzle-orm';
import type { HookRunInput } from '../../domain/agent/hook-run-store.port.ts';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import { hookRunsTable } from './schema/index.ts';

export class HookRunStore {
  constructor(private readonly db: OrgSqliteDb) {}

  record(orgId: string, input: HookRunInput): void {
    this.db
      .insert(hookRunsTable)
      .values({
        id: crypto.randomUUID(),
        orgId,
        agentId: input.agentId,
        hookId: input.hookId,
        event: input.event,
        handlerType: input.handlerType,
        status: input.status,
        durationMs: input.durationMs,
        summary: input.summary ?? null,
        errorCode: input.errorCode ?? null,
        effectsJson: JSON.stringify(input.effects),
        runId: input.runId ?? null,
        threadId: input.threadId ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  list(agentId: string, limit: number): HookRun[] {
    const rows = this.db
      .select()
      .from(hookRunsTable)
      .where(eq(hookRunsTable.agentId, agentId))
      .orderBy(desc(hookRunsTable.createdAt), desc(hookRunsTable.id))
      .limit(limit)
      .all();
    return rows.flatMap((row) => {
      const run = toHookRun(row);
      return run === undefined ? [] : [run];
    });
  }
}

function toHookRun(row: typeof hookRunsTable.$inferSelect): HookRun | undefined {
  const event = HookEventNameSchema.safeParse(row.event);
  if (!event.success) {
    return undefined;
  }
  const status = HookRunStatusSchema.safeParse(row.status);
  return {
    id: row.id,
    agentId: row.agentId,
    hookId: row.hookId,
    event: event.data,
    handlerType: row.handlerType,
    status: status.success ? status.data : 'failed',
    durationMs: row.durationMs,
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.errorCode !== null ? { errorCode: row.errorCode } : {}),
    effects: parseEffects(row.effectsJson),
    ...(row.runId !== null ? { runId: row.runId } : {}),
    ...(row.threadId !== null ? { threadId: row.threadId } : {}),
    createdAt: row.createdAt,
  };
}

function parseEffects(raw: string): AgentHookEffect[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const result = HookEffectSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export type { AgentHookEvent };
