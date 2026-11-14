import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { sheetsTools } from './sheets-tools.ts';

const ADDON_ID = 'harnesys.google-sheets';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: sheetsTools,
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
