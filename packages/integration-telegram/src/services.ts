import type { IntegrationContext } from 'harnesys/integration';
import type { LoginSessions } from './auth/login-sessions.ts';
import {
  findRule,
  insertRule,
  listPosts,
  listRuleSourceIds,
  setRuleSources,
  updateRule,
} from './db/store.ts';
import { notFound, TelegramFeedError } from './model/errors.ts';
import type { PostRecord, RuleRecord } from './model/records.ts';
import type { ListPostsQuery, UpsertRuleBody } from './model/schemas.ts';
import { syncAutomations } from './publish.ts';
import { backfillSource } from './sources.ts';

async function resolveThreadId(
  ctx: IntegrationContext,
  body: UpsertRuleBody,
  ruleId?: string,
): Promise<string> {
  if (body.threadId) {
    return body.threadId;
  }
  if (ruleId) {
    const existing = findRule(ctx.db, ruleId);
    if (existing) {
      return existing.threadId;
    }
  }
  const created = await ctx.threads.create({
    agentId: body.agentId,
    title: body.name,
    kind: 'chat',
  });
  return created.threadId;
}

function ruleFields(body: UpsertRuleBody, threadId: string, now: string) {
  return {
    name: body.name,
    status: body.status ?? ('active' as const),
    agentId: body.agentId,
    threadId,
    modeId: body.modeId ?? 'default',
    detail: body.detail ?? '',
    filter: body.filter ?? [],
    history: body.history ?? ('none' as const),
    historyLast: body.historyLast ?? 20,
    maxRunsPerDay: body.maxRunsPerDay ?? 50,
    throttleSec: body.throttleSec ?? 0,
    runsDate: '',
    runsToday: 0,
    lastFiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveRule(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  body: UpsertRuleBody,
  ruleId?: string,
): Promise<RuleRecord> {
  const now = new Date().toISOString();
  const threadId = await resolveThreadId(ctx, body, ruleId);
  const fields = ruleFields(body, threadId, now);
  let saved: RuleRecord | undefined;
  if (ruleId) {
    if (!findRule(ctx.db, ruleId)) {
      throw notFound('rule', ruleId);
    }
    updateRule(ctx.db, ruleId, fields, fields.filter);
    setRuleSources(ctx.db, ruleId, body.sourceIds);
    saved = findRule(ctx.db, ruleId);
  } else {
    const record: RuleRecord = { id: crypto.randomUUID(), ...fields };
    insertRule(ctx.db, record, body.sourceIds);
    saved = record;
  }
  syncAutomations(ctx);
  if (!saved) {
    throw notFound('rule', ruleId ?? 'new');
  }
  if (saved.history === 'last') {
    await backfillSubscribedSources(ctx, sessions, saved);
  }
  return saved;
}

async function backfillSubscribedSources(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  rule: RuleRecord,
): Promise<void> {
  for (const sourceId of listRuleSourceIds(ctx.db, rule.id)) {
    try {
      await backfillSource(ctx, sessions, sourceId, rule.historyLast);
    } catch (error) {
      if (!(error instanceof TelegramFeedError)) {
        throw error;
      }
    }
  }
}

export function deleteRule(ctx: IntegrationContext, id: string): void {
  if (!findRule(ctx.db, id)) {
    throw notFound('rule', id);
  }
  ctx.db.run(`DELETE FROM rules WHERE id = ?`, [id]);
  syncAutomations(ctx);
}

export function queryPosts(ctx: IntegrationContext, query: ListPostsQuery): PostRecord[] {
  return listPosts(ctx.db, query);
}
