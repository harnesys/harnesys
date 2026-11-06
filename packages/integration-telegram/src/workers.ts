import type { IntegrationContext } from 'harnesys/integration';
import type { LoginSessions } from './auth/login-sessions.ts';
import { POST_KEEP_PER_SOURCE, POST_MAX_AGE_DAYS, PRUNE_INTERVAL_MS } from './db/schema.ts';
import { listSources, prunePosts, updateSource } from './db/store.ts';
import { createIngestor } from './feed/ingest.ts';
import { getHandle } from './telegram/runtime.ts';

const TICK_MS = 30_000;

export function readerWorkerKey(readerId: string): string {
  return `reader:${readerId}`;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      clearTimeout(timer);
      finish();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runReader(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
  signal: AbortSignal,
): Promise<void> {
  const handle = await getHandle(ctx, sessions, readerId);
  const ingestor = createIngestor(ctx);
  const unsubscribe = handle.onPost((peerId, post) => {
    void ingestor.onPost(peerId, post).catch((error: unknown) => {
      ctx.logger.warn('telegram post ingest failed', {
        peerId,
        postId: post.postId,
        err: error instanceof Error ? error.message : String(error),
      });
    });
  });
  await joinPendingSources(ctx, handle, readerId);
  let lastPrune = Date.now();
  while (!signal.aborted) {
    await wait(TICK_MS, signal);
    if (Date.now() - lastPrune >= PRUNE_INTERVAL_MS) {
      prunePosts(ctx.db, POST_KEEP_PER_SOURCE, POST_MAX_AGE_DAYS);
      lastPrune = Date.now();
    }
  }
  unsubscribe();
}

async function joinPendingSources(
  ctx: IntegrationContext,
  handle: Awaited<ReturnType<typeof getHandle>>,
  readerId: string,
): Promise<void> {
  for (const source of listSources(ctx.db).filter((row) => row.readerId === readerId)) {
    if (source.joined) {
      continue;
    }
    try {
      const joined = await handle.join(source);
      updateSource(ctx.db, source.id, { joined: joined.joined });
    } catch (error) {
      ctx.logger.warn('telegram source join failed', {
        sourceId: source.id,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startReaderWorker(
  ctx: IntegrationContext,
  sessions: LoginSessions,
  readerId: string,
): void {
  ctx.workers.register(readerWorkerKey(readerId), (worker) =>
    runReader(ctx, sessions, readerId, worker.signal),
  );
}

export async function stopReaderWorker(ctx: IntegrationContext, readerId: string): Promise<void> {
  await ctx.workers.stop(readerWorkerKey(readerId));
}

export async function stopAllReaderWorkers(
  ctx: IntegrationContext,
  readerIds: string[],
): Promise<void> {
  for (const readerId of readerIds) {
    await stopReaderWorker(ctx, readerId);
  }
}
