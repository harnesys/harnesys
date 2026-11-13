import { defineAddon, type RouteHandler, startAddonProcess } from '@harnesys/sdk';
import { STARTER_XML } from './starter.ts';
import { VIEWER_HTML } from './viewer-html.ts';

const ADDON_ID = 'harnesys.drawio';
const ADDON_VERSION = '0.1.0';

const viewerPage: RouteHandler = async () => ({
  status: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: VIEWER_HTML,
});

const template: RouteHandler = async () => ({
  status: 200,
  body: { content: STARTER_XML },
});

export const addon = defineAddon({
  routes: {
    viewer: viewerPage,
    template,
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
