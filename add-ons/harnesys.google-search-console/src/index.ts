import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { searchConsoleTools } from './search-console-tools.ts';

const ADDON_ID = 'harnesys.google-search-console';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: searchConsoleTools,
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
