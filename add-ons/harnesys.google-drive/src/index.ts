import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { googleDriveSource } from './drive-source.ts';

const ADDON_ID = 'harnesys.google-drive';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  sources: {
    'google-drive': googleDriveSource,
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
