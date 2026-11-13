import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { listSchedules } from './store.ts';
import { tick } from './tick.ts';
import { schedulerTrigger } from './trigger.ts';

const ADDON_ID = 'harnesys.scheduler';
const ADDON_VERSION = '1.0.0';

const schedules: RouteHandler = async (_request, ctx: AddonContext) => {
  const rows = await listSchedules(ctx);
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        instanceId: row.instanceId,
        name: row.name,
        cron: row.cron,
        status: row.status,
        nextRunAt: row.nextRunAt,
        lastFiredAt: row.lastFiredAt,
        error: row.error,
        threadId: row.target.threadId,
      })),
    },
  };
};

export const addon = defineAddon({
  triggers: { 'scheduler.cron': schedulerTrigger },
  jobs: { tick },
  routes: { schedules },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
