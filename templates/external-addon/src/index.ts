import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { items } from './routes.ts';
import { bookmarks } from './tools.ts';

const ADDON_ID = 'acme.example';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: bookmarks,
  routes: { items },
  notifications: {
    'config.changed': async (params, ctx) => {
      await ctx.log.info('config changed', { keys: params.keys });
    },
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
