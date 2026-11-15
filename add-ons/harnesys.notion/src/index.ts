import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { readTools } from './tools-read.ts';
import { writeTools } from './tools-write.ts';

const ADDON_ID = 'harnesys.notion';
const ADDON_VERSION = '1.0.2';

export const addon = defineAddon({ tools: { ...readTools, ...writeTools } });

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
