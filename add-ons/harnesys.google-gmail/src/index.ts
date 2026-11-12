import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { gmailPoller } from './gmail-poller.ts';
import { gmailTools } from './gmail-tools.ts';
import { gmailTrigger } from './gmail-trigger.ts';

const ADDON_ID = 'harnesys.google-gmail';
const ADDON_VERSION = '1.1.0';

export const addon = defineAddon({
  tools: gmailTools,
  triggers: { 'gmail.message': gmailTrigger },
  workers: { 'gmail-mail-poller': gmailPoller },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
