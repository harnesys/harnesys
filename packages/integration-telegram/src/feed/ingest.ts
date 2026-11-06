import type { IntegrationContext } from 'harnesys/integration';
import { TEXT_LIMIT } from '../db/schema.ts';
import {
  claimFire,
  findRule,
  findSourceByPeer,
  insertPost,
  listRulesForSource,
  releaseFire,
  updatePost,
  updateRule,
  updateSource,
} from '../db/store.ts';
import {
  isRuleOverCap,
  isRuleThrottled,
  type PostOutcome,
  type PostRecord,
  type RuleRecord,
  runsDate,
  type SourceRecord,
} from '../model/records.ts';
import { matchesFilter } from './filter.ts';
import type { NormalizedPost } from './normalize.ts';
import { fireId, taskText } from './text.ts';

export interface Ingestor {
  onPost(peerId: string, post: NormalizedPost): Promise<void>;
}

export function createIngestor(ctx: IntegrationContext): Ingestor {
  return {
    async onPost(peerId: string, raw: NormalizedPost): Promise<void> {
      const source = findSourceByPeer(ctx.db, peerId);
      if (!source) {
        return;
      }
      const now = new Date().toISOString();
      const post: PostRecord = {
        id: crypto.randomUUID(),
        sourceId: source.id,
        postId: raw.postId,
        topicId: raw.topicId,
        authorTitle: raw.authorTitle,
        text: raw.text,
        mediaKinds: raw.mediaKinds,
        publishedAt: raw.publishedAt,
        receivedAt: now,
        outcome: 'new',
        fireCount: 0,
      };
      if (insertPost(ctx.db, post) === 'duplicate') {
        return;
      }
      if (raw.postId > source.lastPostId) {
        updateSource(ctx.db, source.id, { lastPostId: raw.postId, updatedAt: now });
      }
      await applyRules(ctx, source, post, now);
      const saved = ctx.db.get<{ outcome: string }>(`SELECT outcome FROM posts WHERE id = ?`, [
        post.id,
      ]);
      ctx.logger.info('telegram post ingested', {
        sourceId: source.id,
        postId: post.postId,
        outcome: saved?.outcome ?? post.outcome,
        textLength: post.text.length,
        truncated: post.text.length > TEXT_LIMIT,
      });
    },
  };
}

async function applyRules(
  ctx: IntegrationContext,
  source: SourceRecord,
  post: PostRecord,
  now: string,
): Promise<void> {
  const rules = listRulesForSource(ctx.db, source.id).filter((rule) => rule.status === 'active');
  if (rules.length === 0) {
    return;
  }
  let outcome: PostOutcome = 'filtered';
  for (const rule of rules) {
    if (!matchesFilter(rule.filter, post)) {
      continue;
    }
    const result = await fireRule(ctx, rule, source, post, now);
    if (result === 'fired') {
      outcome = 'fired';
      break;
    }
    if (result === 'throttled' || result === 'over_limit') {
      outcome = result;
    }
  }
  updatePost(ctx.db, post.id, { outcome });
}

async function fireRule(
  ctx: IntegrationContext,
  rule: RuleRecord,
  source: SourceRecord,
  post: PostRecord,
  now: string,
): Promise<PostOutcome> {
  if (isRuleOverCap(rule, now)) {
    return 'over_limit';
  }
  if (isRuleThrottled(rule, now)) {
    return 'throttled';
  }
  const token = fireId(post.id, rule.id);
  if (!claimFire(ctx.db, token, rule.id, post.id)) {
    return 'filtered';
  }
  const result = await ctx.runs.dispatch({
    threadId: rule.threadId,
    agentId: rule.agentId,
    text: taskText(rule, source, post),
    modeId: rule.modeId,
    fireId: token,
  });
  if (result !== 'fired') {
    releaseFire(ctx.db, token);
    return result === 'busy' ? 'throttled' : 'filtered';
  }
  const current = findRule(ctx.db, rule.id) ?? rule;
  const sameDay = current.runsDate === runsDate(now);
  updateRule(ctx.db, rule.id, {
    runsDate: runsDate(now),
    runsToday: sameDay ? current.runsToday + 1 : 1,
    lastFiredAt: now,
    updatedAt: now,
  });
  updatePost(ctx.db, post.id, { fireCount: post.fireCount + 1 });
  return 'fired';
}
