import type {
  GoogleYoutubeChannel,
  GoogleYoutubeCommentThread,
  GoogleYoutubePlaylist,
  GoogleYoutubeUploadInput,
  GoogleYoutubeVideo,
  GoogleYoutubeVideoSummary,
} from 'harnesys';
import { asGoogleRecord, stringField } from './google-http.ts';

export const DEFAULT_CATEGORY_ID = '22';

export function videoResourceOf(input: GoogleYoutubeUploadInput): Record<string, unknown> {
  return {
    snippet: {
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      categoryId: input.categoryId ?? DEFAULT_CATEGORY_ID,
    },
    status: { privacyStatus: input.privacyStatus ?? 'private' },
  };
}

export function videoOf(raw: Record<string, unknown>): GoogleYoutubeVideo {
  const snippet = asGoogleRecord(raw.snippet);
  const statistics = asGoogleRecord(raw.statistics);
  const contentDetails = asGoogleRecord(raw.contentDetails);
  const status = asGoogleRecord(raw.status);
  return {
    id: stringField(raw, 'id') ?? '',
    title: stringField(snippet, 'title') ?? '',
    description: stringField(snippet, 'description') ?? '',
    publishedAt: stringField(snippet, 'publishedAt'),
    privacyStatus: stringField(status, 'privacyStatus'),
    viewCount: numberField(statistics, 'viewCount'),
    likeCount: numberField(statistics, 'likeCount'),
    commentCount: numberField(statistics, 'commentCount'),
    thumbnailUrl: thumbnailOf(snippet),
    duration: stringField(contentDetails, 'duration'),
    tags: stringArrayOf(snippet.tags),
    categoryId: stringField(snippet, 'categoryId'),
  };
}

export function channelOf(raw: Record<string, unknown>): GoogleYoutubeChannel {
  const snippet = asGoogleRecord(raw.snippet);
  const statistics = asGoogleRecord(raw.statistics);
  const contentDetails = asGoogleRecord(raw.contentDetails);
  const related = asGoogleRecord(contentDetails.relatedPlaylists);
  return {
    id: stringField(raw, 'id') ?? '',
    title: stringField(snippet, 'title') ?? '',
    description: stringField(snippet, 'description') ?? '',
    customUrl: stringField(snippet, 'customUrl'),
    thumbnailUrl: thumbnailOf(snippet),
    subscriberCount: numberField(statistics, 'subscriberCount'),
    viewCount: numberField(statistics, 'viewCount'),
    videoCount: numberField(statistics, 'videoCount'),
    uploadsPlaylistId: stringField(related, 'uploads'),
    publishedAt: stringField(snippet, 'publishedAt'),
  };
}

export function playlistOf(raw: Record<string, unknown>): GoogleYoutubePlaylist {
  const snippet = asGoogleRecord(raw.snippet);
  const contentDetails = asGoogleRecord(raw.contentDetails);
  return {
    id: stringField(raw, 'id') ?? '',
    title: stringField(snippet, 'title') ?? '',
    itemCount: numberField(contentDetails, 'itemCount'),
    publishedAt: stringField(snippet, 'publishedAt'),
  };
}

export function videoSummaryOfPlaylistItem(
  raw: Record<string, unknown>,
): GoogleYoutubeVideoSummary {
  const snippet = asGoogleRecord(raw.snippet);
  const contentDetails = asGoogleRecord(raw.contentDetails);
  const status = asGoogleRecord(raw.status);
  return {
    id: stringField(contentDetails, 'videoId') ?? '',
    title: stringField(snippet, 'title') ?? '',
    publishedAt:
      stringField(contentDetails, 'videoPublishedAt') ?? stringField(snippet, 'publishedAt'),
    privacyStatus: stringField(status, 'privacyStatus'),
    viewCount: null,
    likeCount: null,
    commentCount: null,
    thumbnailUrl: thumbnailOf(snippet),
  };
}

export function commentThreadOf(raw: Record<string, unknown>): GoogleYoutubeCommentThread {
  const snippet = asGoogleRecord(raw.snippet);
  const topComment = asGoogleRecord(snippet.topLevelComment);
  const top = asGoogleRecord(topComment.snippet);
  return {
    id: stringField(topComment, 'id') ?? '',
    videoId: stringField(snippet, 'videoId'),
    authorDisplayName: stringField(top, 'authorDisplayName') ?? '',
    textDisplay: stringField(top, 'textDisplay') ?? '',
    likeCount: numberField(top, 'likeCount'),
    replyCount: numberField(snippet, 'totalReplyCount'),
    publishedAt: stringField(top, 'publishedAt'),
  };
}

export function thumbnailOf(record: Record<string, unknown>): string | null {
  const thumbnails = asGoogleRecord(record.thumbnails);
  for (const key of ['medium', 'high', 'default']) {
    const url = stringField(asGoogleRecord(thumbnails[key]), 'url');
    if (url) {
      return url;
    }
  }
  return null;
}

export function itemsOf(res: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(res.items) ? res.items.map(asGoogleRecord) : [];
}

export function numberField(record: Record<string, unknown>, key: string): number | null {
  const raw = record[key];
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string' && raw !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
