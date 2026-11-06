import { defineIntegration, type IntegrationContext } from 'harnesys/integration';
import { LoginSessions } from './auth/login-sessions.ts';
import { TELEGRAM_SCHEMA_SQL } from './db/schema.ts';
import { listReaders } from './db/store.ts';
import { readerState, syncAutomations } from './publish.ts';
import { purgeInterruptedReaders } from './readers.ts';
import { createRoutes } from './routes.ts';
import { startReaderWorker, stopAllReaderWorkers } from './workers.ts';

const sessions = new LoginSessions();

function authorizedReaderIds(ctx: IntegrationContext): string[] {
  return listReaders(ctx.db)
    .filter((reader) => reader.status === 'authorized')
    .map((reader) => reader.id);
}

export const telegramIntegration = defineIntegration({
  id: 'telegram',
  title: 'Telegram',
  version: '0.1.0',
  description: 'Telegram channels, groups, and topics as an automation trigger',
  icon: 'send',
  async setup(ctx) {
    ctx.db.exec(TELEGRAM_SCHEMA_SQL);
  },
  async start(ctx) {
    await purgeInterruptedReaders(ctx, sessions);
    for (const readerId of authorizedReaderIds(ctx)) {
      startReaderWorker(ctx, sessions, readerId);
    }
    syncAutomations(ctx);
  },
  async stop(ctx) {
    await stopAllReaderWorkers(ctx, authorizedReaderIds(ctx));
  },
  async connection(ctx) {
    return readerState(ctx);
  },
  automationKinds: [
    {
      kind: 'telegram.feed',
      label: 'Telegram feed',
      description: 'New Telegram posts, filtered',
      icon: 'send',
      requiresConnection: true,
    },
  ],
  routes: createRoutes(sessions),
});

export { sessions as telegramLoginSessions };
