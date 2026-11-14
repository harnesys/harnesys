import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { YOUTUBE_API, youtubeJson } from './youtube-client.ts';
import { accountOf, optionalTextOf, requiredTextOf } from './youtube-input.ts';
import {
  splitList,
  videoSummaryOf,
  type YoutubeVideoSummary,
  type YoutubeVideoWire,
} from './youtube-models.ts';

interface VideoListWire {
  items?: YoutubeVideoWire[];
}

interface VideoSnippetWire {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
}

const updateVideo: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const videoId = requiredTextOf(input, 'videoId');
  const account = accountOf(input);
  const patch = {
    title: optionalTextOf(input, 'title'),
    description: optionalTextOf(input, 'description'),
    tags: optionalTextOf(input, 'tags'),
    categoryId: optionalTextOf(input, 'categoryId'),
    privacyStatus: optionalTextOf(input, 'privacyStatus'),
  };
  if (Object.values(patch).every((value) => value === undefined)) {
    throw new AddonError('invalid_params', {
      detail: 'nothing to update: pass title, description, tags, categoryId or privacyStatus',
    });
  }
  const current = await youtubeJson<VideoListWire>(ctx, {
    ...account,
    url: `${YOUTUBE_API}/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
  });
  const snippet = (current.items ?? [])[0]?.snippet;
  if (snippet === undefined) {
    throw new AddonError('not_found', { detail: `no such video: ${videoId}` });
  }
  const merged = mergedSnippetOf(snippet, patch);
  const updated = await youtubeJson<YoutubeVideoWire>(ctx, {
    ...account,
    method: 'PUT',
    url: `${YOUTUBE_API}/videos?part=snippet`,
    body: JSON.stringify({ id: videoId, snippet: merged }),
  });
  const summary = videoSummaryOf(updated);
  await ctx.log.info('youtube video updated', {
    videoId,
    fields: Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .join(','),
  });
  return { video: summary } satisfies { video: YoutubeVideoSummary };
};

const addToPlaylist: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const playlistId = requiredTextOf(input, 'playlistId');
  const videoId = requiredTextOf(input, 'videoId');
  await youtubeJson<Record<string, unknown>>(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: `${YOUTUBE_API}/playlistItems?part=snippet`,
    body: JSON.stringify({
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
    }),
  });
  return { playlistId, videoId, added: true } satisfies {
    playlistId: string;
    videoId: string;
    added: boolean;
  };
};

const replyToComment: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const commentId = requiredTextOf(input, 'commentId');
  const text = requiredTextOf(input, 'text');
  await youtubeJson<Record<string, unknown>>(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: `${YOUTUBE_API}/comments?part=snippet`,
    body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
  });
  return { commentId, replied: true } satisfies { commentId: string; replied: boolean };
};

function mergedSnippetOf(
  snippet: VideoSnippetWire,
  patch: {
    title?: string | undefined;
    description?: string | undefined;
    tags?: string | undefined;
    categoryId?: string | undefined;
  },
): VideoSnippetWire {
  return {
    title: patch.title ?? snippet.title,
    description: patch.description ?? snippet.description,
    tags: patch.tags === undefined ? snippet.tags : splitList(patch.tags),
    categoryId: patch.categoryId ?? snippet.categoryId,
    ...(snippet.defaultLanguage === undefined ? {} : { defaultLanguage: snippet.defaultLanguage }),
  };
}

export const writeTools: Record<string, ToolHandler> = {
  update_video: updateVideo,
  add_to_playlist: addToPlaylist,
  reply_to_comment: replyToComment,
};
