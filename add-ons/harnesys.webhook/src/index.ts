import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { hook, hookGet } from './hook-route.ts';
import { deliveries, instances, rotateSecret, rotateUrl, testHook } from './org-routes.ts';
import { webhookTrigger } from './trigger.ts';

const ADDON_ID = 'harnesys.webhook';
const ADDON_VERSION = '2.0.0';

export const addon = defineAddon({
  triggers: { 'webhook.http': webhookTrigger },
  routes: {
    hook,
    'hook-get': hookGet,
    instances,
    deliveries,
    'rotate-url': rotateUrl,
    'rotate-secret': rotateSecret,
    test: testHook,
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
