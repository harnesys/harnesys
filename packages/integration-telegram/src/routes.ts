import type { AddonResponse, IntegrationContext, IntegrationRoute } from 'harnesys/integration';
import { z } from 'zod';
import type { LoginSessions } from './auth/login-sessions.ts';
import { findSource, listReaders, listRuleSourceIds, listRules, listSources } from './db/store.ts';
import { postUrl } from './feed/text.ts';
import { TelegramFeedError } from './model/errors.ts';
import type { PostRecord, ReaderRecord, RuleRecord, SourceRecord } from './model/records.ts';
import {
  AddSourceBodySchema,
  AuthorizeReaderBodySchema,
  BackfillBodySchema,
  CreateReaderBodySchema,
  ListPostsQuerySchema,
  UpsertRuleBodySchema,
} from './model/schemas.ts';
import { authorizeReader, createReader, removeReader } from './readers.ts';
import { deleteRule, queryPosts, saveRule } from './services.ts';
import { addSource, backfillSource, refreshSource, removeSource } from './sources.ts';

function param(request: { params: Record<string, string> }, name: string): string {
  const value = request.params[name];
  if (!value) {
    throw new TelegramFeedError('source_not_found', `Missing path parameter: ${name}`, 400);
  }
  return value;
}

function readerPublic(
  reader: ReaderRecord,
  loginPending: boolean,
  loginPhone?: string,
): Record<string, unknown> {
  return {
    id: reader.id,
    loginPending,
    loginPhone: loginPending ? (loginPhone ?? null) : null,
    label: reader.label,
    status: reader.status,
    apiId: reader.apiId,
    phoneMasked: reader.phoneMasked,
    dcId: reader.dcId,
    lastError: reader.lastError,
    lastSeenAt: reader.lastSeenAt,
    createdAt: reader.createdAt,
    updatedAt: reader.updatedAt,
  };
}

function sourcePublic(source: SourceRecord): Record<string, unknown> {
  return {
    id: source.id,
    readerId: source.readerId,
    peerKind: source.peerKind,
    peerId: source.peerId,
    username: source.username,
    title: source.title,
    joined: source.joined,
    watchTopics: source.watchTopics,
    lastPostId: source.lastPostId,
    lastError: source.lastError,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function rulePublic(ctx: IntegrationContext, rule: RuleRecord): Record<string, unknown> {
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    agentId: rule.agentId,
    threadId: rule.threadId,
    modeId: rule.modeId,
    detail: rule.detail,
    sourceIds: listRuleSourceIds(ctx.db, rule.id),
    filter: rule.filter,
    history: rule.history,
    historyLast: rule.historyLast,
    maxRunsPerDay: rule.maxRunsPerDay,
    throttleSec: rule.throttleSec,
    runsToday: rule.runsToday,
    lastFiredAt: rule.lastFiredAt,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

function postPublic(ctx: IntegrationContext, post: PostRecord): Record<string, unknown> {
  const source = findSource(ctx.db, post.sourceId);
  return {
    id: post.id,
    sourceId: post.sourceId,
    sourceTitle: source?.title ?? 'Unknown',
    postId: post.postId,
    topicId: post.topicId,
    authorTitle: post.authorTitle,
    text: post.text,
    url: source ? postUrl(source, post) : null,
    mediaKinds: post.mediaKinds,
    publishedAt: post.publishedAt,
    receivedAt: post.receivedAt,
    outcome: post.outcome,
    fireCount: post.fireCount,
  };
}

async function guard(handler: () => Promise<AddonResponse>): Promise<AddonResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof TelegramFeedError) {
      return { status: error.status, body: { message: error.message, code: error.code } };
    }
    if (error instanceof z.ZodError) {
      return { status: 400, body: { message: 'Invalid request', issues: error.issues } };
    }
    throw error;
  }
}

export function createRoutes(sessions: LoginSessions): IntegrationRoute[] {
  return [
    {
      method: 'POST',
      path: '/reader',
      handler: (ctx, request) =>
        guard(async () => {
          const body = CreateReaderBodySchema.parse(request.body);
          const reader = await createReader(ctx, sessions, body);
          return {
            status: 201,
            body: { reader: readerPublic(reader, true, sessions.get(reader.id)?.phone) },
          };
        }),
    },
    {
      method: 'POST',
      path: '/reader/authorize',
      handler: (ctx, request) =>
        guard(async () => {
          const body = AuthorizeReaderBodySchema.parse(request.body);
          const readerId = body.readerId ?? pendingReaderId(ctx, sessions);
          if (!readerId) {
            throw new TelegramFeedError(
              'reader_not_found',
              'No Telegram account is waiting for a code',
              409,
            );
          }
          const reader = await authorizeReader(ctx, sessions, readerId, body);
          return {
            body: {
              reader: readerPublic(
                reader,
                sessions.get(readerId) !== undefined,
                sessions.get(readerId)?.phone,
              ),
            },
          };
        }),
    },
    {
      method: 'GET',
      path: '/reader',
      handler: (ctx) =>
        guard(async () => ({
          body: {
            items: listReaders(ctx.db).map((row) => {
              const pending = sessions.get(row.id);
              return readerPublic(row, pending !== undefined, pending?.phone);
            }),
          },
        })),
    },
    {
      method: 'DELETE',
      path: '/reader/:id',
      handler: (ctx, request) =>
        guard(async () => {
          await removeReader(ctx, sessions, param(request, 'id'));
          return { status: 204, body: null };
        }),
    },
    {
      method: 'POST',
      path: '/sources',
      handler: (ctx, request) =>
        guard(async () => {
          const body = AddSourceBodySchema.parse(request.body);
          return {
            status: 201,
            body: { source: sourcePublic(await addSource(ctx, sessions, body)) },
          };
        }),
    },
    {
      method: 'GET',
      path: '/sources',
      handler: (ctx) =>
        guard(async () => ({
          body: { items: listSources(ctx.db).map(sourcePublic) },
        })),
    },
    {
      method: 'POST',
      path: '/sources/:id/refresh',
      handler: (ctx, request) =>
        guard(async () => ({
          body: { source: sourcePublic(await refreshSource(ctx, sessions, param(request, 'id'))) },
        })),
    },
    {
      method: 'POST',
      path: '/sources/:id/backfill',
      handler: (ctx, request) =>
        guard(async () => {
          const body = BackfillBodySchema.parse(request.body);
          return { body: await backfillSource(ctx, sessions, param(request, 'id'), body.limit) };
        }),
    },
    {
      method: 'DELETE',
      path: '/sources/:id',
      handler: (ctx, request) =>
        guard(async () => {
          removeSource(ctx, param(request, 'id'));
          return { status: 204, body: null };
        }),
    },
    {
      method: 'GET',
      path: '/posts',
      handler: (ctx, request) =>
        guard(async () => {
          const query = ListPostsQuerySchema.parse(request.query);
          return { body: { items: queryPosts(ctx, query).map((post) => postPublic(ctx, post)) } };
        }),
    },
    {
      method: 'GET',
      path: '/rules',
      handler: (ctx) =>
        guard(async () => ({
          body: { items: listRules(ctx.db).map((rule) => rulePublic(ctx, rule)) },
        })),
    },
    {
      method: 'POST',
      path: '/rules',
      handler: (ctx, request) =>
        guard(async () => {
          const body = UpsertRuleBodySchema.parse(request.body);
          return {
            status: 201,
            body: { rule: rulePublic(ctx, await saveRule(ctx, sessions, body)) },
          };
        }),
    },
    {
      method: 'PATCH',
      path: '/rules/:id',
      handler: (ctx, request) =>
        guard(async () => {
          const body = UpsertRuleBodySchema.parse(request.body);
          const rule = await saveRule(ctx, sessions, body, param(request, 'id'));
          return { body: { rule: rulePublic(ctx, rule) } };
        }),
    },
    {
      method: 'DELETE',
      path: '/rules/:id',
      handler: (ctx, request) =>
        guard(async () => {
          deleteRule(ctx, param(request, 'id'));
          return { status: 204, body: null };
        }),
    },
  ];
}

function pendingReaderId(ctx: IntegrationContext, sessions: LoginSessions): string | undefined {
  return listReaders(ctx.db)
    .filter((reader) => reader.status === 'awaiting_code' || reader.status === 'awaiting_password')
    .find((reader) => sessions.get(reader.id) !== undefined)?.id;
}
