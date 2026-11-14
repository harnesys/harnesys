import { AddonError } from '@harnesys/sdk';

export interface YoutubeThumbnailWire {
  url?: string;
}

export interface YoutubeChannelWire {
  id?: string;
  snippet?: { title?: string; description?: string; customUrl?: string };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface YoutubeVideoWire {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    thumbnails?: Record<string, YoutubeThumbnailWire>;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; uploadStatus?: string };
}

export interface YoutubePlaylistWire {
  id?: string;
  snippet?: { title?: string; description?: string; publishedAt?: string };
  contentDetails?: { itemCount?: number };
}

export interface YoutubePlaylistItemWire {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    playlistId?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
}

export interface YoutubeCommentThreadWire {
  id?: string;
  snippet?: {
    videoId?: string;
    topLevelComment?: {
      id?: string;
      snippet?: {
        authorDisplayName?: string;
        textDisplay?: string;
        likeCount?: number;
        publishedAt?: string;
        totalReplyCount?: number;
      };
    };
  };
}

export interface YoutubeChannelSummary {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  subscribers: number;
  views: number;
  videos: number;
  uploadsPlaylistId: string | null;
}

export interface YoutubeVideoSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  duration: string;
  privacyStatus: string;
  views: number;
  likes: number;
  comments: number;
  thumbnailUrl: string | null;
}

export interface YoutubePlaylistSummary {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  itemCount: number;
}

export interface YoutubeCommentSummary {
  commentId: string;
  videoId: string;
  author: string;
  text: string;
  likes: number;
  publishedAt: string;
  replyCount: number;
}

export function channelSummaryOf(wire: YoutubeChannelWire): YoutubeChannelSummary {
  return {
    id: requiredId(wire.id, 'channel'),
    title: textOf(wire.snippet?.title),
    description: textOf(wire.snippet?.description),
    customUrl: textOf(wire.snippet?.customUrl),
    subscribers: numberOf(wire.statistics?.subscriberCount),
    views: numberOf(wire.statistics?.viewCount),
    videos: numberOf(wire.statistics?.videoCount),
    uploadsPlaylistId: textOf(wire.contentDetails?.relatedPlaylists?.uploads) || null,
  };
}

export function videoSummaryOf(wire: YoutubeVideoWire): YoutubeVideoSummary {
  const thumbnails = wire.snippet?.thumbnails ?? {};
  const thumbnailUrl =
    textOf(thumbnails.high?.url) ||
    textOf(thumbnails.medium?.url) ||
    textOf(thumbnails.default?.url);
  return {
    id: requiredId(wire.id, 'video'),
    title: textOf(wire.snippet?.title),
    description: textOf(wire.snippet?.description),
    tags: Array.isArray(wire.snippet?.tags) ? wire.snippet.tags : [],
    publishedAt: textOf(wire.snippet?.publishedAt),
    duration: textOf(wire.contentDetails?.duration),
    privacyStatus: textOf(wire.status?.privacyStatus),
    views: numberOf(wire.statistics?.viewCount),
    likes: numberOf(wire.statistics?.likeCount),
    comments: numberOf(wire.statistics?.commentCount),
    thumbnailUrl: thumbnailUrl === '' ? null : thumbnailUrl,
  };
}

export function playlistSummaryOf(wire: YoutubePlaylistWire): YoutubePlaylistSummary {
  return {
    id: requiredId(wire.id, 'playlist'),
    title: textOf(wire.snippet?.title),
    description: textOf(wire.snippet?.description),
    publishedAt: textOf(wire.snippet?.publishedAt),
    itemCount: wire.contentDetails?.itemCount ?? 0,
  };
}

export function commentSummaryOf(wire: YoutubeCommentThreadWire): YoutubeCommentSummary {
  const comment = wire.snippet?.topLevelComment;
  return {
    commentId: requiredId(comment?.id ?? wire.id, 'comment'),
    videoId: textOf(wire.snippet?.videoId),
    author: textOf(comment?.snippet?.authorDisplayName),
    text: textOf(comment?.snippet?.textDisplay),
    likes: comment?.snippet?.likeCount ?? 0,
    publishedAt: textOf(comment?.snippet?.publishedAt),
    replyCount: comment?.snippet?.totalReplyCount ?? 0,
  };
}

export function requiredId(value: string | undefined, kind: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new AddonError('invalid_response', { detail: `YouTube ${kind} has no id` });
  }
  return value;
}

export function textOf(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function numberOf(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}
