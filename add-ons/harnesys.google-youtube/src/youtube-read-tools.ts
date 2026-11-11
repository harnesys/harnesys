import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { YOUTUBE_API, youtubeJson } from './youtube-client.ts';
import { accountOf, maxResultsOf, requiredTextOf } from './youtube-input.ts';
import {
  channelSummaryOf,
  commentSummaryOf,
  playlistSummaryOf,
  videoSummaryOf,
  type YoutubeChannelSummary,
  type YoutubeChannelWire,
  type YoutubeCommentSummary,
  type YoutubeCommentThreadWire,
  type YoutubePlaylistItemWire,
  type YoutubePlaylistSummary,
  type YoutubePlaylistWire,
  type YoutubeVideoSummary,
  type YoutubeVideoWire,
} from './youtube-models.ts';

const DEFAULT_VIDEOS = 10;
const DEFAULT_PLAYLISTS = 25;
const DEFAULT_COMMENTS = 20;
const LIST_MAX = 50;
const VIDEO_PARTS = 'snippet,statistics,contentDetails,status';

interface ChannelListWire {
  items?: YoutubeChannelWire[];
}

interface VideoListWire {
  items?: YoutubeVideoWire[];
}

interface PlaylistListWire {
  items?: YoutubePlaylistWire[];
}

interface PlaylistItemListWire {
  items?: YoutubePlaylistItemWire[];
}

interface CommentThreadListWire {
  items?: YoutubeCommentThreadWire[];
}

const listChannels: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const json = await youtubeJson<ChannelListWire>(ctx, {
    ...accountOf(input),
    url: `${YOUTUBE_API}/channels?part=snippet,statistics,contentDetails&mine=true`,
  });
  const items = json.items ?? [];
  if (items.length === 0) {
    throw new AddonError('not_found', {
      detail: 'the bound Google account has no YouTube channel',
    });
  }
  return { channels: items.map(channelSummaryOf) } satisfies { channels: YoutubeChannelSummary[] };
};

const listVideos: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const account = accountOf(input);
  const limit = maxResultsOf(input, DEFAULT_VIDEOS, LIST_MAX);
  const uploadsPlaylistId = await uploadsPlaylistOf(ctx, account);
  const playlist = await youtubeJson<PlaylistItemListWire>(ctx, {
    ...account,
    url: `${YOUTUBE_API}/playlistItems?part=contentDetails&maxResults=${limit}&playlistId=${encodeURIComponent(uploadsPlaylistId)}`,
  });
  const videoIds = (playlist.items ?? [])
    .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  if (videoIds.length === 0) {
    return { videos: [] } satisfies { videos: YoutubeVideoSummary[] };
  }
  const videos = await youtubeJson<VideoListWire>(ctx, {
    ...account,
    url: `${YOUTUBE_API}/videos?part=${VIDEO_PARTS}&id=${videoIds.map(encodeURIComponent).join(',')}`,
  });
  return { videos: (videos.items ?? []).map(videoSummaryOf) } satisfies {
    videos: YoutubeVideoSummary[];
  };
};

const videoDetails: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const videoId = requiredTextOf(input, 'videoId');
  const json = await youtubeJson<VideoListWire>(ctx, {
    ...accountOf(input),
    url: `${YOUTUBE_API}/videos?part=${VIDEO_PARTS}&id=${encodeURIComponent(videoId)}`,
  });
  const item = (json.items ?? [])[0];
  if (item === undefined) {
    throw new AddonError('not_found', { detail: `no such video: ${videoId}` });
  }
  return { video: videoSummaryOf(item) } satisfies { video: YoutubeVideoSummary };
};

const listPlaylists: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const limit = maxResultsOf(input, DEFAULT_PLAYLISTS, LIST_MAX);
  const json = await youtubeJson<PlaylistListWire>(ctx, {
    ...accountOf(input),
    url: `${YOUTUBE_API}/playlists?part=snippet,contentDetails&mine=true&maxResults=${limit}`,
  });
  return { playlists: (json.items ?? []).map(playlistSummaryOf) } satisfies {
    playlists: YoutubePlaylistSummary[];
  };
};

const listComments: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const videoId = requiredTextOf(input, 'videoId');
  const limit = maxResultsOf(input, DEFAULT_COMMENTS, LIST_MAX);
  const json = await youtubeJson<CommentThreadListWire>(ctx, {
    ...accountOf(input),
    url: `${YOUTUBE_API}/commentThreads?part=snippet&order=time&textFormat=plainText&maxResults=${limit}&videoId=${encodeURIComponent(videoId)}`,
  });
  return { comments: (json.items ?? []).map(commentSummaryOf) } satisfies {
    comments: YoutubeCommentSummary[];
  };
};

async function uploadsPlaylistOf(
  ctx: AddonContext,
  account: { accountId?: string },
): Promise<string> {
  const json = await youtubeJson<ChannelListWire>(ctx, {
    ...account,
    url: `${YOUTUBE_API}/channels?part=contentDetails&mine=true`,
  });
  const uploads = (json.items ?? [])[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (typeof uploads !== 'string' || uploads === '') {
    throw new AddonError('not_found', {
      detail: 'the bound Google account has no YouTube uploads playlist',
    });
  }
  return uploads;
}

export const readTools: Record<string, ToolHandler> = {
  list_channels: listChannels,
  list_videos: listVideos,
  video_details: videoDetails,
  list_playlists: listPlaylists,
  list_comments: listComments,
};
