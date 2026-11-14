import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { analyticsTools } from './youtube-analytics.ts';
import { readTools } from './youtube-read-tools.ts';
import { uploadTools } from './youtube-upload.ts';
import { writeTools } from './youtube-write-tools.ts';

const ADDON_ID = 'harnesys.google-youtube';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: {
    ...readTools,
    ...writeTools,
    ...uploadTools,
    ...analyticsTools,
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
