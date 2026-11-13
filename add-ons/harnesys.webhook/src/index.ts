import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { hook, instances, webhookTrigger } from './hook.ts';

const ADDON_ID = 'harnesys.webhook';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  triggers: { 'webhook.http': webhookTrigger },
  routes: { hook, instances },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
