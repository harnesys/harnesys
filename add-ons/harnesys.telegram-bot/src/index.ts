import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { poller } from './poller.ts';
import { chats, pair, unbind } from './routes.ts';
import { telegramTransport } from './transport.ts';

const ADDON_ID = 'harnesys.telegram-bot';
const ADDON_VERSION = '1.3.0';

export const addon = defineAddon({
  transport: telegramTransport,
  workers: { poller },
  routes: { chats, pair, unbind },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
