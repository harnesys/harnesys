import type { IntegrationContext } from 'harnesys/integration';
import type { LoginSessions } from './auth/login-sessions.ts';
import { deleteReader, findReader, insertReader, listReaders, updateReader } from './db/store.ts';
import { notFound, TelegramFeedError } from './model/errors.ts';
import type { ReaderRecord } from './model/records.ts';
import type { CreateReaderBody } from './model/schemas.ts';
import { syncAutomations } from './publish.ts';
import { dropHandle, startLogin } from './telegram/runtime.ts';
import { startReaderWorker, stopReaderWorker } from './workers.ts';

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) {
    return `${digits.slice(0, 2)}***`;
  }
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

export async function createReader(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  body: CreateReaderBody,
): Promise<ReaderRecord> {
  await purgeInterruptedReaders(ctx, sessions);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const reader: ReaderRecord = {
    id,
    label: body.label,
    status: 'anonymous',
    apiId: body.apiId,
    phoneMasked: maskPhone(body.phone),
    dcId: null,
    lastError: null,
    lastSeenAt: null,
    createdAt: now,
    updatedAt: now,
  };
  insertReader(ctx.db, reader);
  await ctx.secrets.set(`reader:${id}:api_hash`, body.apiHash);
  sessions.open(id, { phone: body.phone, apiId: body.apiId, apiHash: body.apiHash });
  void finishLogin(ctx, sessions, id, body.phone);
  return reader;
}

export async function purgeInterruptedReaders(
  ctx: IntegrationContext,
  sessions: LoginSessions,
): Promise<void> {
  const stale = listReaders(ctx.db).filter((reader) => reader.status !== 'authorized');
  for (const reader of stale) {
    sessions.close(reader.id, new Error('Replaced by a new login attempt'));
    await dropHandle(ctx, reader.id);
    await ctx.secrets.delete(`reader:${reader.id}:api_hash`);
    await ctx.secrets.delete(`reader:${reader.id}:session`);
    deleteReader(ctx.db, reader.id);
  }
}

async function finishLogin(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
  phone: string,
): Promise<void> {
  const pending = sessions.get(readerId);
  if (!pending) {
    return;
  }
  try {
    const handle = await startLogin(ctx, sessions, {
      creds: { apiId: pending.apiId, apiHash: pending.apiHash },
      readerId,
      phone,
      onPrompt: (kind) => {
        updateReader(ctx.db, readerId, {
          status: kind === 'code' ? 'awaiting_code' : 'awaiting_password',
        });
      },
    });
    await ctx.secrets.set(`reader:${readerId}:session`, handle.sessionString);
    updateReader(ctx.db, readerId, {
      status: 'authorized',
      dcId: handle.dcId,
      lastError: null,
      lastSeenAt: new Date().toISOString(),
    });
    startReaderWorker(ctx, sessions, readerId);
  } catch (error) {
    ctx.logger.warn('telegram login failed', {
      readerId,
      err: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    updateReader(ctx.db, readerId, {
      status: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
  syncAutomations(ctx);
}

export async function authorizeReader(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
  input: { code?: string; password?: string },
): Promise<ReaderRecord> {
  const reader = findReader(ctx.db, readerId);
  if (!reader) {
    throw notFound('reader', readerId);
  }
  if (!sessions.get(readerId)) {
    throw new TelegramFeedError(
      'login_expired',
      'This login attempt is no longer active. Press Connect to start again.',
      409,
    );
  }
  if (input.code) {
    sessions.submit(readerId, 'code', input.code);
  }
  if (input.password) {
    sessions.submit(readerId, 'password', input.password);
  }
  const waiting = sessions.isWaiting(readerId);
  if (waiting) {
    updateReader(ctx.db, readerId, {
      status: waiting === 'code' ? 'awaiting_code' : 'awaiting_password',
    });
  }
  const saved = findReader(ctx.db, readerId);
  if (!saved) {
    throw notFound('reader', readerId);
  }
  return saved;
}

export async function removeReader(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
): Promise<void> {
  if (!findReader(ctx.db, readerId)) {
    throw notFound('reader', readerId);
  }
  await stopReaderWorker(ctx, readerId);
  sessions.close(readerId, new Error('Reader removed'));
  await dropHandle(ctx, readerId);
  await ctx.secrets.delete(`reader:${readerId}:api_hash`);
  await ctx.secrets.delete(`reader:${readerId}:session`);
  deleteReader(ctx.db, readerId);
  syncAutomations(ctx);
}
