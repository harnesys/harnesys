import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { poller } from './poller.ts';
import { bindings, chats, connect, rename, topics } from './routes.ts';
import { telegramTools } from './tools.ts';
import { telegramTransport } from './transport.ts';

const ADDON_ID = 'harnesys.telegram-groups';
const ADDON_VERSION = '1.4.0';

export const addon = defineAddon({
  transport: telegramTransport,
  tools: telegramTools,
  workers: { poller },
  routes: { chats, topics, connect, rename, bindings },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
