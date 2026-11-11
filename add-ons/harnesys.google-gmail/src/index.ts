import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { gmailTools } from './gmail-tools.ts';

const ADDON_ID = 'harnesys.google-gmail';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: gmailTools,
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
