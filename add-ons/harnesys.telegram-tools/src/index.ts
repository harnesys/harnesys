import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { telegramTools } from './tools.ts';

const ADDON_ID = 'harnesys.telegram-tools';
const ADDON_VERSION = '1.1.0';

export const addon = defineAddon({ tools: telegramTools });

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
