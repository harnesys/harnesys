import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { calendarTools } from './calendar-tools.ts';

const ADDON_ID = 'harnesys.google-calendar';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: calendarTools,
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
