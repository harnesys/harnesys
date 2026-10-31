import type {
  GoogleYoutubeAnalyticsQuery,
  GoogleYoutubeReplyInput,
} from '../../ports/google-youtube.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { GoogleToolsDeps } from './google-tools-deps.ts';

interface ListPlaylistsInput {
  maxResults?: number;
}

interface AddToPlaylistInput {
  playlistId: string;
  videoId: string;
}

interface ListCommentsInput {
  videoId: string;
  maxResults?: number;
}

interface ReplyToCommentInput {
  commentId: string;
  text: string;
}

interface AnalyticsReportInput {
  startDate: string;
  endDate: string;
  metrics: string;
  dimensions?: string;
  filters?: string;
  maxResults?: number;
}

const LIST_RESULTS_MAX = 50;
const ANALYTICS_ROWS_MAX = 100;

export function createYoutubeCommunityTools(deps: GoogleToolsDeps): ToolDefinition[] {
  return [
    tool('youtube_list_playlists', {
      group: 'google',
      description:
        'List playlists of the connected YouTube channel with id, title, and item count.',
      input: {
        type: 'object',
        properties: {
          maxResults: { type: 'integer', minimum: 1, maximum: LIST_RESULTS_MAX },
        },
        required: [],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ListPlaylistsInput;
          const playlists = await deps.google.listPlaylists(
            deps.resolveScope(),
            deps.integrationId,
            input.maxResults,
          );
          return { playlists };
        }),
    }),
    tool('youtube_add_to_playlist', {
      group: 'google',
      description:
        'Add a video to one of the connected channel YouTube playlists. Get playlistId from youtube_list_playlists and videoId from youtube_list_videos.',
      input: {
        type: 'object',
        properties: {
          playlistId: { type: 'string' },
          videoId: { type: 'string' },
        },
        required: ['playlistId', 'videoId'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as AddToPlaylistInput;
          await deps.google.addToPlaylist(
            deps.resolveScope(),
            deps.integrationId,
            input.playlistId,
            input.videoId,
          );
          return { playlistId: input.playlistId, videoId: input.videoId, added: true };
        }),
    }),
    tool('youtube_list_comments', {
      group: 'google',
      description:
        'List viewer comments on a YouTube video (newest first): author, text, likes, reply count, comment id. Use comment ids to reply with youtube_reply_to_comment.',
      input: {
        type: 'object',
        properties: {
          videoId: { type: 'string' },
          maxResults: { type: 'integer', minimum: 1, maximum: LIST_RESULTS_MAX },
        },
        required: ['videoId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ListCommentsInput;
          const comments = await deps.google.listComments(
            deps.resolveScope(),
            deps.integrationId,
            input.videoId,
            input.maxResults,
          );
          return { comments };
        }),
    }),
    tool('youtube_reply_to_comment', {
      group: 'google',
      description:
        'Post a reply to a YouTube comment as the connected channel. Get commentId from youtube_list_comments.',
      input: {
        type: 'object',
        properties: {
          commentId: { type: 'string', description: 'Top-level comment id to reply to' },
          text: { type: 'string' },
        },
        required: ['commentId', 'text'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as ReplyToCommentInput;
          const reply: GoogleYoutubeReplyInput = {
            parentCommentId: input.commentId,
            text: input.text,
          };
          await deps.google.replyToComment(deps.resolveScope(), deps.integrationId, reply);
          return { commentId: input.commentId, replied: true };
        }),
    }),
    tool('youtube_analytics_report', {
      group: 'google',
      description:
        'Query YouTube Analytics for the connected channel (views, watch time, subscribers, likes, traffic). Common metrics: views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments. Common dimensions: day,video,country,trafficSourceType.',
      input: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' },
          metrics: { type: 'string', description: 'Comma-separated metric names' },
          dimensions: { type: 'string', description: 'Comma-separated dimension names' },
          filters: { type: 'string', description: 'Analytics filter, e.g. video==VIDEO_ID' },
          maxResults: { type: 'integer', minimum: 1, maximum: ANALYTICS_ROWS_MAX },
        },
        required: ['startDate', 'endDate', 'metrics'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as AnalyticsReportInput;
          const query: GoogleYoutubeAnalyticsQuery = {
            startDate: input.startDate,
            endDate: input.endDate,
            metrics: splitList(input.metrics),
            ...(input.dimensions !== undefined ? { dimensions: splitList(input.dimensions) } : {}),
            ...(input.filters !== undefined && input.filters !== ''
              ? { filters: input.filters }
              : {}),
            ...(input.maxResults !== undefined ? { maxResults: input.maxResults } : {}),
          };
          const report = await deps.google.analyticsReport(
            deps.resolveScope(),
            deps.integrationId,
            query,
          );
          return { report };
        }),
    }),
  ];
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
