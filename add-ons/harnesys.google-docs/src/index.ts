import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { docsTools } from './docs-tools.ts';

const ADDON_ID = 'harnesys.google-docs';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: docsTools,
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
