import type {
  GoogleYoutubeChannel,
  GoogleYoutubeCommentThread,
  GoogleYoutubePlaylist,
  GoogleYoutubeReplyInput,
  GoogleYoutubeUploadInput,
  GoogleYoutubeUploadResult,
  GoogleYoutubeVideo,
  GoogleYoutubeVideoPatch,
  GoogleYoutubeVideoSummary,
} from 'harnesys';
import { IntegrationProviderErrorException } from '../../../domain/integration/integration.error.ts';
import { asGoogleRecord, excerptOf, googleApiJson, stringField } from './google-http.ts';
import {
  channelOf,
  commentThreadOf,
  DEFAULT_CATEGORY_ID,
  itemsOf,
  playlistOf,
  videoOf,
  videoResourceOf,
  videoSummaryOfPlaylistItem,
} from './youtube-mappers.ts';

const YOUTUBE_API_BASE = '/youtube/v3';
const YOUTUBE_UPLOAD_BASE = '/upload/youtube/v3';
const DEFAULT_MAX_RESULTS = 25;
const MAX_RESULTS_LIMIT = 50;

export async function listMyChannels(token: string): Promise<GoogleYoutubeChannel[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${YOUTUBE_API_BASE}/channels`,
    query: new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      mine: 'true',
    }),
  });
  return itemsOf(res).map(channelOf);
}

export async function listPlaylistVideoSummaries(
  token: string,
  playlistId: string,
  maxResults?: number,
): Promise<GoogleYoutubeVideoSummary[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${YOUTUBE_API_BASE}/playlistItems`,
    query: new URLSearchParams({
      part: 'snippet,contentDetails,status',
      playlistId,
      maxResults: String(clampMax(maxResults)),
    }),
  });
  return itemsOf(res).map(videoSummaryOfPlaylistItem);
}

export async function getVideos(
  token: string,
  videoIds: readonly string[],
): Promise<GoogleYoutubeVideo[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${YOUTUBE_API_BASE}/videos`,
    query: new URLSearchParams({
      part: 'snippet,statistics,contentDetails,status',
      id: videoIds.join(','),
    }),
  });
  return itemsOf(res).map(videoOf);
}

export async function updateVideo(
  token: string,
  videoId: string,
  patch: GoogleYoutubeVideoPatch,
): Promise<GoogleYoutubeVideo> {
  const [current] = await getVideos(token, [videoId]);
  if (!current) {
    throw new IntegrationProviderErrorException('google', `video ${videoId} not found`);
  }
  const snippet: Record<string, unknown> = {
    title: patch.title ?? current.title,
    categoryId: patch.categoryId ?? current.categoryId ?? DEFAULT_CATEGORY_ID,
  };
  if (patch.description !== undefined) {
    snippet.description = patch.description;
  }
  if (patch.tags !== undefined) {
    snippet.tags = patch.tags;
  }
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'PUT',
    path: `${YOUTUBE_API_BASE}/videos`,
    query: new URLSearchParams({ part: 'snippet,status' }),
    body: {
      id: videoId,
      snippet,
      status: { privacyStatus: patch.privacyStatus ?? current.privacyStatus ?? 'private' },
    },
  });
  return videoOf(res);
}

export async function uploadVideo(
  token: string,
  input: GoogleYoutubeUploadInput,
): Promise<GoogleYoutubeUploadResult> {
  const init = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${YOUTUBE_UPLOAD_BASE}/videos`,
    query: new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' }),
    body: videoResourceOf(input),
    headers: { 'X-Upload-Content-Type': input.contentType },
  });
  const uploadUrl = stringField(init, 'location');
  if (!uploadUrl) {
    throw new IntegrationProviderErrorException('google', 'missing resumable session Location');
  }
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': input.contentType,
    },
    body: input.bytes,
  });
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'google',
      `video upload failed: ${res.status} ${res.statusText}`,
    );
  }
  const created = asGoogleRecord(await res.json());
  return {
    videoId: stringField(created, 'id') ?? '',
    title: stringField(asGoogleRecord(created.snippet), 'title') ?? input.title,
    privacyStatus: stringField(asGoogleRecord(created.status), 'privacyStatus'),
    uploadUrl: null,
  };
}

export async function setThumbnail(
  token: string,
  videoId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com${YOUTUBE_API_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new IntegrationProviderErrorException(
      'google',
      `thumbnail set failed: ${res.status} ${excerptOf(await res.text())}`,
    );
  }
}

export async function listMyPlaylists(
  token: string,
  maxResults?: number,
): Promise<GoogleYoutubePlaylist[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${YOUTUBE_API_BASE}/playlists`,
    query: new URLSearchParams({
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: String(clampMax(maxResults)),
    }),
  });
  return itemsOf(res).map(playlistOf);
}

export async function addToPlaylist(
  token: string,
  playlistId: string,
  videoId: string,
): Promise<void> {
  await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${YOUTUBE_API_BASE}/playlistItems`,
    query: new URLSearchParams({ part: 'snippet' }),
    body: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
}

export async function listVideoComments(
  token: string,
  videoId: string,
  maxResults?: number,
): Promise<GoogleYoutubeCommentThread[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${YOUTUBE_API_BASE}/commentThreads`,
    query: new URLSearchParams({
      part: 'snippet',
      videoId,
      maxResults: String(clampMax(maxResults)),
    }),
  });
  return itemsOf(res).map(commentThreadOf);
}

export async function replyToComment(token: string, input: GoogleYoutubeReplyInput): Promise<void> {
  await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${YOUTUBE_API_BASE}/comments`,
    query: new URLSearchParams({ part: 'snippet' }),
    body: {
      snippet: {
        parentId: input.parentCommentId,
        textOriginal: input.text,
      },
    },
  });
}

function clampMax(maxResults?: number): number {
  return Math.min(Math.max(1, maxResults ?? DEFAULT_MAX_RESULTS), MAX_RESULTS_LIMIT);
}
