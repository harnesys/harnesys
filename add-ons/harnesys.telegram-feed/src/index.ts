import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { feedTrigger } from './feed-trigger.ts';
import { feedWorker } from './feed-worker.ts';

const ADDON_ID = 'harnesys.telegram-feed';
const ADDON_VERSION = '1.0.0';

const posts: RouteHandler = async (_request, ctx: AddonContext) => {
  const rows = await ctx.db.all(
    'select peer, post_id as postId, text, published_at as publishedAt, received_at as receivedAt, fires from posts order by post_id desc limit 200',
  );
  return { status: 200, body: { rows } };
};

const sources: RouteHandler = async (_request, ctx: AddonContext) => {
  const rows = await ctx.db.all(
    'select s.peer, s.title, s.kind, s.username, s.added_at as addedAt, w.last_post_id as lastPostId, w.updated_at as updatedAt from sources s left join source_watermark w on w.peer = s.peer order by s.peer',
  );
  return { status: 200, body: { rows } };
};

export const addon = defineAddon({
  triggers: { 'telegram.feed': feedTrigger },
  workers: { 'feed-poller': feedWorker },
  routes: { posts, sources },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
