import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { poller } from './poller.ts';
import { telegramTools } from './tools.ts';
import { telegramTransport } from './transport.ts';

const ADDON_ID = 'harnesys.telegram-bot';
const ADDON_VERSION = '1.0.0';

const chats: RouteHandler = async (_request, ctx: AddonContext) => {
  const rows = await ctx.db.all(
    'select channel, chat_id as chatId, kind, title, topic_id as topicId, updated_at as updatedAt from chats order by updated_at desc limit 200',
  );
  const bindings = await ctx.bindings.channels('telegram');
  const threadByChannel = new Map(bindings.map((binding) => [binding.channel, binding.threadId]));
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        ...row,
        threadId: typeof row.channel === 'string' ? (threadByChannel.get(row.channel) ?? '') : '',
      })),
    },
  };
};

export const addon = defineAddon({
  transport: telegramTransport,
  tools: telegramTools,
  workers: { poller },
  routes: { chats },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
