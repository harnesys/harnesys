import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { poller } from './poller.ts';
import { bindings, chats, connect, topics, unbind } from './routes.ts';
import { telegramTransport } from './transport.ts';

const ADDON_ID = 'harnesys.telegram-groups';
const ADDON_VERSION = '1.7.0';

export const addon = defineAddon({
  transport: telegramTransport,
  workers: { poller },
  routes: { chats, topics, connect, unbind, bindings },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
