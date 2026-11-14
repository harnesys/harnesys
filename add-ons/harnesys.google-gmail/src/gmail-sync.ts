import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { GMAIL_API, gmailJson } from './gmail-client.ts';
import { effectiveQueryOf, excludeTermsOf, gmailDateOf, matchesExclude } from './gmail-filter.ts';
import { type GmailMessageWire, messageMetaOf } from './gmail-message.ts';
import {
  nowIso,
  pendingDefer,
  pendingIdsOf,
  pendingResolve,
  setWatermark,
  watermarkOf,
} from './gmail-store.ts';
import { type StoredInstance } from './gmail-trigger.ts';

const LIST_PAGE_SIZE = 25;
const HISTORY_PAGE_SIZE = 100;
const MAIL_URL_BASE = 'https://mail.google.com/mail/u/0/#inbox';
const METADATA_HEADERS = ['Subject', 'From'];

interface GmailSnapshot {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  internalDate: string;
}

function snapshotOf(wire: GmailMessageWire): GmailSnapshot {
  const meta = messageMetaOf(wire);
  const ms = typeof wire.internalDate === 'string' ? Number(wire.internalDate) : Number.NaN;
  return {
    messageId: meta.id,
    threadId: meta.threadId,
    from: meta.from,
    subject: meta.subject,
    snippet: meta.snippet,
    internalDate: Number.isNaN(ms) ? '' : new Date(ms).toISOString(),
  };
}

interface HistoryWire {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }> }>;
  historyId?: string;
  nextPageToken?: string;
}

interface ListWire {
  messages?: Array<{ id?: string; threadId?: string }>;
  historyId?: string;
  nextPageToken?: string;
}

interface ProfileWire {
  historyId?: string;
}

export interface HistoryAdded {
  ids: Set<string>;
  historyId: string | null;
}

/** Shared per-poll-cycle evaluation state. */
interface Cycle {
  ctx: AddonContext;
  accountId: string;
  cache: Map<string, GmailSnapshot>;
  searchCache: Map<string, string[]>;
}

function collectAdded(page: HistoryWire, ids: Set<string>): void {
  for (const record of page.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const id = added.message?.id;
      if (typeof id === 'string' && id !== '') {
        ids.add(id);
      }
    }
  }
}

export async function addedMessagesOf(
  ctx: AddonContext,
  accountId: string,
  startHistoryId: string,
): Promise<HistoryAdded | null> {
  const ids = new Set<string>();
  let historyId: string | null = null;
  let pageToken: string | undefined;
  try {
    do {
      const pageTokenPart =
        pageToken === undefined ? '' : `&pageToken=${encodeURIComponent(pageToken)}`;
      const page = await gmailJson<HistoryWire>(ctx, {
        accountId,
        url: `${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&maxResults=${HISTORY_PAGE_SIZE}${pageTokenPart}`,
      });
      collectAdded(page, ids);
      if (typeof page.historyId === 'string' && page.historyId !== '') {
        historyId = page.historyId;
      }
      pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
    } while (pageToken !== undefined);
  } catch (error) {
    if (error instanceof AddonError && error.reason === 'not_found') {
      return null;
    }
    throw error;
  }
  return { ids, historyId };
}

export async function currentHistoryId(ctx: AddonContext, accountId: string): Promise<string> {
  const profile = await gmailJson<ProfileWire>(ctx, {
    accountId,
    url: `${GMAIL_API}/profile`,
  });
  if (typeof profile.historyId !== 'string' || profile.historyId === '') {
    throw new AddonError('invalid_response', { detail: 'Gmail profile has no historyId' });
  }
  return profile.historyId;
}

function searchTextOf(snapshot: GmailSnapshot): string {
  return `${snapshot.subject} ${snapshot.from} ${snapshot.snippet}`;
}

async function snapshotOfMessage(cycle: Cycle, messageId: string): Promise<GmailSnapshot | null> {
  const cached = cycle.cache.get(messageId);
  if (cached !== undefined) {
    return cached;
  }
  const wire = await gmailJson<GmailMessageWire>(cycle.ctx, {
    accountId: cycle.accountId,
    url: `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=${METADATA_HEADERS.join('&metadataHeaders=')}`,
  });
  const snapshot = snapshotOf(wire);
  cycle.cache.set(messageId, snapshot);
  return snapshot;
}

/** Attempts to fire one message. Returns false when the message should be retried later. */
async function fireMessage(
  ctx: AddonContext,
  instance: StoredInstance,
  snapshot: GmailSnapshot,
): Promise<boolean> {
  if (snapshot.internalDate !== '' && snapshot.internalDate < instance.startedAt) {
    return true;
  }
  const threadPart = snapshot.threadId === '' ? 'no-thread' : snapshot.threadId;
  const runKey = `${instance.instanceId}:${threadPart}:${snapshot.messageId}`;
  const claim = await ctx.db.run(
    'insert or ignore into fired (run_key, instance_id, at) values (?, ?, ?)',
    [runKey, instance.instanceId, nowIso()],
  );
  if (claim.changes === 0) {
    return true;
  }
  const result = await ctx.triggers.fire({
    instanceId: instance.instanceId,
    runKey,
    text: `[gmail] New mail from ${snapshot.from || 'unknown sender'}: ${snapshot.subject || '(no subject)'}`,
    payload: {
      messageId: snapshot.messageId,
      threadId: snapshot.threadId,
      from: snapshot.from,
      subject: snapshot.subject,
      snippet: snapshot.snippet,
      url: `${MAIL_URL_BASE}/${snapshot.messageId}`,
    },
  });
  if (result.outcome === 'fired') {
    return true;
  }
  await ctx.db.run('delete from fired where run_key = ?', [runKey]);
  return false;
}

function idsFromList(list: ListWire): string[] {
  return (list.messages ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

async function searchMessageIds(cycle: Cycle, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const pageTokenPart =
      pageToken === undefined ? '' : `&pageToken=${encodeURIComponent(pageToken)}`;
    const page = await gmailJson<ListWire>(cycle.ctx, {
      accountId: cycle.accountId,
      url: `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${LIST_PAGE_SIZE}${pageTokenPart}`,
    });
    ids.push(...idsFromList(page));
    pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
  } while (pageToken !== undefined);
  return ids;
}

/**
 * Evaluates candidates against an instance's filters and fires the matches.
 * Returns candidate ids that neither matched the query nor were excluded: Gmail's
 * search index lags behind history.list, so those are retried on the next poll
 * via the pending table until they show up in the query or age out.
 */
async function fireMatchedMessages(
  cycle: Cycle,
  instance: StoredInstance,
  candidates: Set<string>,
): Promise<Set<string>> {
  const exclude = excludeTermsOf(instance.config);
  const unresolved = new Set<string>();
  const query = effectiveQueryOf(instance.config);
  let matched: Set<string> | null = null;
  if (query !== '') {
    const cached = cycle.searchCache.get(query);
    matched = new Set(cached ?? (await searchMessageIds(cycle, query)));
    if (cached === undefined) {
      cycle.searchCache.set(query, [...matched]);
    }
  }
  for (const messageId of candidates) {
    const snapshot = await snapshotOfMessage(cycle, messageId);
    if (snapshot === null) {
      continue;
    }
    if (matchesExclude(exclude, searchTextOf(snapshot))) {
      continue;
    }
    if (matched !== null && !matched.has(messageId)) {
      unresolved.add(messageId);
      continue;
    }
    await fireMessage(cycle.ctx, instance, snapshot);
  }
  return unresolved;
}

async function fallbackSync(
  cycle: Cycle,
  instances: StoredInstance[],
  staleWatermark: string,
): Promise<void> {
  const after = gmailDateOf(staleWatermark);
  for (const instance of instances) {
    const query = effectiveQueryOf(instance.config);
    const scoped = `${query} after:${after}`.trim();
    const ids = await searchMessageIds({ ...cycle, cache: new Map() }, scoped);
    const exclude = excludeTermsOf(instance.config);
    for (const messageId of ids) {
      const snapshot = await snapshotOfMessage(cycle, messageId);
      if (snapshot === null) {
        continue;
      }
      if (matchesExclude(exclude, searchTextOf(snapshot))) {
        continue;
      }
      if (await fireMessage(cycle.ctx, instance, snapshot)) {
        await pendingResolve(cycle.ctx, instance.instanceId, messageId);
      }
    }
  }
}

export async function pollAccount(
  ctx: AddonContext,
  accountId: string,
  instances: StoredInstance[],
): Promise<void> {
  if (instances.length === 0) {
    return;
  }
  const watermark = await watermarkOf(ctx, accountId);
  if (watermark === null) {
    const historyId = await currentHistoryId(ctx, accountId);
    await setWatermark(ctx, accountId, historyId, nowIso());
    await ctx.log.info('gmail poller stored the initial historyId watermark', { accountId });
    return;
  }
  const added = await addedMessagesOf(ctx, accountId, watermark.historyId);
  if (added === null) {
    const cycle: Cycle = {
      ctx,
      accountId,
      cache: new Map(),
      searchCache: new Map(),
    };
    await fallbackSync(cycle, instances, watermark.lastSeenAt);
    await setWatermark(ctx, accountId, await currentHistoryId(ctx, accountId), nowIso());
    await ctx.log.info('gmail historyId expired; full search fallback completed', {
      accountId,
      after: gmailDateOf(watermark.lastSeenAt),
    });
    return;
  }
  const cycle: Cycle = {
    ctx,
    accountId,
    cache: new Map(),
    searchCache: new Map(),
  };
  for (const instance of instances) {
    const candidates = new Set([...added.ids, ...(await pendingIdsOf(ctx, instance.instanceId))]);
    if (candidates.size === 0) {
      continue;
    }
    const unresolved = await fireMatchedMessages(cycle, instance, candidates);
    for (const messageId of candidates) {
      if (unresolved.has(messageId)) {
        await pendingDefer(ctx, instance.instanceId, messageId);
      } else {
        await pendingResolve(ctx, instance.instanceId, messageId);
      }
    }
  }
  if (added.historyId !== null && added.historyId !== watermark.historyId) {
    await setWatermark(ctx, accountId, added.historyId, nowIso());
  }
}
