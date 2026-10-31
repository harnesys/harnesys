import type { CapabilityScope } from '../domain/pack.ts';

export interface GoogleYoutubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  uploadsPlaylistId: string | null;
  publishedAt: string | null;
}

export interface GoogleYoutubeVideoSummary {
  id: string;
  title: string;
  publishedAt: string | null;
  privacyStatus: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  thumbnailUrl: string | null;
}

export interface GoogleYoutubeVideo extends GoogleYoutubeVideoSummary {
  description: string;
  duration: string | null;
  tags: string[];
  categoryId: string | null;
}

export interface GoogleYoutubeVideoPatch {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: string;
}

export type GoogleYoutubePrivacy = 'public' | 'unlisted' | 'private';

export interface GoogleYoutubeUploadInput {
  bytes: Uint8Array;
  contentType: string;
  title: string;
  description?: string;
  privacyStatus?: GoogleYoutubePrivacy;
  tags?: string[];
  categoryId?: string;
}

export interface GoogleYoutubeUploadResult {
  videoId: string;
  title: string;
  privacyStatus: string | null;
  uploadUrl: string | null;
}

export interface GoogleYoutubeThumbnailInput {
  bytes: Uint8Array;
  contentType: string;
}

export interface GoogleYoutubePlaylist {
  id: string;
  title: string;
  itemCount: number | null;
  publishedAt: string | null;
}

export interface GoogleYoutubeCommentThread {
  id: string;
  videoId: string | null;
  authorDisplayName: string;
  textDisplay: string;
  likeCount: number | null;
  replyCount: number | null;
  publishedAt: string | null;
}

export interface GoogleYoutubeReplyInput {
  parentCommentId: string;
  text: string;
}

export interface GoogleYoutubeAnalyticsQuery {
  startDate: string;
  endDate: string;
  metrics: string[];
  dimensions?: string[];
  filters?: string;
  maxResults?: number;
}

export interface GoogleYoutubeAnalyticsReport {
  columnHeaders: GoogleYoutubeAnalyticsColumn[];
  rows: GoogleYoutubeAnalyticsRow[];
}

export interface GoogleYoutubeAnalyticsColumn {
  name: string;
  columnType: string;
}

export type GoogleYoutubeAnalyticsRow = (string | number | null)[];

export interface GoogleYoutubePort {
  listChannels(scope: CapabilityScope, integrationId: string): Promise<GoogleYoutubeChannel[]>;
  listVideos(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeVideoSummary[]>;
  getVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
  ): Promise<GoogleYoutubeVideo>;
  updateVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    patch: GoogleYoutubeVideoPatch,
  ): Promise<GoogleYoutubeVideo>;
  uploadVideo(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeUploadInput,
  ): Promise<GoogleYoutubeUploadResult>;
  setThumbnail(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    input: GoogleYoutubeThumbnailInput,
  ): Promise<void>;
  listPlaylists(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubePlaylist[]>;
  addToPlaylist(
    scope: CapabilityScope,
    integrationId: string,
    playlistId: string,
    videoId: string,
  ): Promise<void>;
  listComments(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeCommentThread[]>;
  replyToComment(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeReplyInput,
  ): Promise<void>;
  analyticsReport(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleYoutubeAnalyticsQuery,
  ): Promise<GoogleYoutubeAnalyticsReport>;
}
