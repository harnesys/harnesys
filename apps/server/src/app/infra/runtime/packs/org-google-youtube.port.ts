import type {
  CapabilityScope,
  GoogleYoutubeAnalyticsQuery,
  GoogleYoutubeAnalyticsReport,
  GoogleYoutubeChannel,
  GoogleYoutubeCommentThread,
  GoogleYoutubePlaylist,
  GoogleYoutubePort,
  GoogleYoutubeReplyInput,
  GoogleYoutubeThumbnailInput,
  GoogleYoutubeUploadInput,
  GoogleYoutubeUploadResult,
  GoogleYoutubeVideo,
  GoogleYoutubeVideoPatch,
  GoogleYoutubeVideoSummary,
} from 'harnesys';
import {
  GOOGLE_YOUTUBE_MANAGE_SCOPE,
  GOOGLE_YOUTUBE_READONLY_SCOPE,
  GOOGLE_YOUTUBE_UPLOAD_SCOPE,
  GOOGLE_YT_ANALYTICS_READONLY_SCOPE,
} from '../../integration/google/google-oauth-device.ts';
import { queryAnalyticsReport } from '../../integration/google/youtube-analytics-api.ts';
import {
  addToPlaylist,
  getVideos,
  listMyChannels,
  listMyPlaylists,
  listPlaylistVideoSummaries,
  listVideoComments,
  replyToComment,
  setThumbnail,
  updateVideo,
  uploadVideo,
} from '../../integration/google/youtube-api.ts';
import type { OrgGoogleDeps } from './org-google.port.ts';
import { withGoogleScopes } from './org-google-scope-gate.ts';

const YT_READ = [GOOGLE_YOUTUBE_READONLY_SCOPE] as const;
const YT_UPLOAD = [GOOGLE_YOUTUBE_UPLOAD_SCOPE] as const;
const YT_MANAGE = [GOOGLE_YOUTUBE_MANAGE_SCOPE] as const;
const YT_ANALYTICS = [GOOGLE_YT_ANALYTICS_READONLY_SCOPE] as const;

const VIDEOS_MAX_RESULTS_LIMIT = 50;

export class OrgGoogleYoutubePort implements GoogleYoutubePort {
  constructor(private readonly deps: OrgGoogleDeps) {}

  listChannels(scope: CapabilityScope, integrationId: string): Promise<GoogleYoutubeChannel[]> {
    return this.withRead(scope.orgId, integrationId, (token) => listMyChannels(token));
  }

  async listVideos(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeVideoSummary[]> {
    const limit = clampLimit(maxResults);
    const channels = await this.listChannels(scope, integrationId);
    const uploads = channels[0]?.uploadsPlaylistId;
    if (!uploads) {
      throw new Error('The channel has no uploads playlist');
    }
    const summaries = await this.withRead(scope.orgId, integrationId, (token) =>
      listPlaylistVideoSummaries(token, uploads, limit),
    );
    const ids = summaries
      .slice(0, limit)
      .map((entry) => entry.id)
      .filter((id) => id !== '');
    if (ids.length === 0) {
      return summaries;
    }
    const detailed = await this.withRead(scope.orgId, integrationId, (token) =>
      getVideos(token, ids),
    );
    return mergeVideoStats(summaries, detailed);
  }

  getVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
  ): Promise<GoogleYoutubeVideo> {
    return this.withRead(scope.orgId, integrationId, async (token) => {
      const [video] = await getVideos(token, [videoId]);
      if (!video) {
        throw new Error(`video ${videoId} not found`);
      }
      return video;
    });
  }

  updateVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    patch: GoogleYoutubeVideoPatch,
  ): Promise<GoogleYoutubeVideo> {
    return this.withManage(scope.orgId, integrationId, (token) =>
      updateVideo(token, videoId, patch),
    );
  }

  uploadVideo(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeUploadInput,
  ): Promise<GoogleYoutubeUploadResult> {
    return this.withUpload(scope.orgId, integrationId, (token) => uploadVideo(token, input));
  }

  setThumbnail(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    input: GoogleYoutubeThumbnailInput,
  ): Promise<void> {
    return this.withUpload(scope.orgId, integrationId, (token) =>
      setThumbnail(token, videoId, input.bytes, input.contentType),
    );
  }

  listPlaylists(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubePlaylist[]> {
    return this.withRead(scope.orgId, integrationId, (token) => listMyPlaylists(token, maxResults));
  }

  addToPlaylist(
    scope: CapabilityScope,
    integrationId: string,
    playlistId: string,
    videoId: string,
  ): Promise<void> {
    return this.withManage(scope.orgId, integrationId, (token) =>
      addToPlaylist(token, playlistId, videoId),
    );
  }

  listComments(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeCommentThread[]> {
    return this.withRead(scope.orgId, integrationId, (token) =>
      listVideoComments(token, videoId, maxResults),
    );
  }

  replyToComment(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeReplyInput,
  ): Promise<void> {
    return this.withManage(scope.orgId, integrationId, (token) => replyToComment(token, input));
  }

  analyticsReport(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleYoutubeAnalyticsQuery,
  ): Promise<GoogleYoutubeAnalyticsReport> {
    return this.withAnalytics(scope.orgId, integrationId, (token) =>
      queryAnalyticsReport(token, query),
    );
  }

  private withRead<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, YT_READ, fn);
  }

  private withUpload<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, YT_UPLOAD, fn);
  }

  private withManage<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, YT_MANAGE, fn);
  }

  private withAnalytics<T>(
    orgId: string,
    integrationId: string,
    fn: (token: string) => Promise<T>,
  ) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, YT_ANALYTICS, fn);
  }
}

function clampLimit(maxResults?: number): number {
  return Math.min(Math.max(1, maxResults ?? 25), VIDEOS_MAX_RESULTS_LIMIT);
}

function mergeVideoStats(
  summaries: GoogleYoutubeVideoSummary[],
  detailed: GoogleYoutubeVideo[],
): GoogleYoutubeVideoSummary[] {
  const byId = new Map(detailed.map((video) => [video.id, video]));
  return summaries.map((summary) => {
    const video = byId.get(summary.id);
    if (!video) {
      return summary;
    }
    return {
      ...summary,
      privacyStatus: video.privacyStatus,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
    };
  });
}
