import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type {
  GoogleYoutubePrivacy,
  GoogleYoutubeThumbnailInput,
  GoogleYoutubeUploadInput,
  GoogleYoutubeUploadResult,
  GoogleYoutubeVideoPatch,
} from '../../ports/google-youtube.ts';
import { type ToolContext, type ToolDefinition, tool } from '../../ports/tools.ts';
import type { GoogleToolsDeps } from './google-tools-deps.ts';

interface ListVideosInput {
  maxResults?: number;
}

interface VideoIdInput {
  videoId: string;
}

interface UpdateVideoInput {
  videoId: string;
  title?: string;
  description?: string;
  tags?: string;
  categoryId?: string;
  privacyStatus?: GoogleYoutubePrivacy;
}

interface UploadVideoInput {
  videoPath: string;
  title: string;
  description?: string;
  privacyStatus?: GoogleYoutubePrivacy;
  tags?: string;
  categoryId?: string;
}

interface SetThumbnailInput {
  videoId: string;
  imagePath: string;
}

const LIST_RESULTS_MAX = 50;
const UPLOAD_BYTES_MAX = 1_000_000_000;
const THUMBNAIL_BYTES_MAX = 2_000_000;

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
};

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function createYoutubeTools(deps: GoogleToolsDeps): ToolDefinition[] {
  return [
    tool('youtube_list_channels', {
      group: 'google',
      description:
        'List the YouTube channels of the connected Google account with title, subscriber/view/video counts, and the uploads playlist id.',
      input: { type: 'object', properties: {}, required: [] },
      sideEffect: 'read',
      execute: async () =>
        runGuard(async () => ({
          channels: await deps.google.listChannels(deps.resolveScope(), deps.integrationId),
        })),
    }),
    tool('youtube_list_videos', {
      group: 'google',
      description:
        'List recent uploads of the connected YouTube channel (newest first) with title, publish date, privacy status, and view/like/comment counts.',
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
          const input = raw as ListVideosInput;
          const videos = await deps.google.listVideos(
            deps.resolveScope(),
            deps.integrationId,
            input.maxResults,
          );
          return { videos };
        }),
    }),
    tool('youtube_video_details', {
      group: 'google',
      description:
        'Read full metadata of one YouTube video: title, description, tags, duration, privacy status, view/like/comment counts. Use youtube_list_videos to find videoId.',
      input: {
        type: 'object',
        properties: { videoId: { type: 'string' } },
        required: ['videoId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as VideoIdInput;
          const video = await deps.google.getVideo(
            deps.resolveScope(),
            deps.integrationId,
            input.videoId,
          );
          return { video };
        }),
    }),
    tool('youtube_update_video', {
      group: 'google',
      description:
        'Update metadata of an owned YouTube video: title, description, tags, categoryId, or privacyStatus (public/unlisted/private). Only the passed fields change.',
      input: {
        type: 'object',
        properties: {
          videoId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'string', description: 'Comma-separated tags' },
          categoryId: {
            type: 'string',
            description: 'YouTube category id, e.g. 22 = People & Blogs',
          },
          privacyStatus: { type: 'string', enum: ['public', 'unlisted', 'private'] },
        },
        required: ['videoId'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as UpdateVideoInput;
          const patch: GoogleYoutubeVideoPatch = {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.tags !== undefined ? { tags: splitList(input.tags) } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.privacyStatus !== undefined ? { privacyStatus: input.privacyStatus } : {}),
          };
          const video = await deps.google.updateVideo(
            deps.resolveScope(),
            deps.integrationId,
            input.videoId,
            patch,
          );
          return { video };
        }),
    }),
    tool('youtube_upload_video', {
      group: 'google',
      description:
        'Upload a video file from the workspace to the connected YouTube channel as a new video (resumable upload). Counts ~1600 of the 10000 daily YouTube quota units. Thumbnail can be set afterwards with youtube_set_thumbnail.',
      input: {
        type: 'object',
        properties: {
          videoPath: {
            type: 'string',
            description: 'Workspace path of the video file (mp4, mov, webm, avi, mpeg)',
          },
          title: { type: 'string' },
          description: { type: 'string' },
          privacyStatus: { type: 'string', enum: ['public', 'unlisted', 'private'] },
          tags: { type: 'string', description: 'Comma-separated tags' },
          categoryId: {
            type: 'string',
            description: 'YouTube category id, default 22 (People & Blogs)',
          },
        },
        required: ['videoPath', 'title'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      gate: fileAccessGate('read', (input) => (input as UploadVideoInput).videoPath),
      execute: async (raw, ctx) =>
        runGuard(() => uploadFromWorkspace(deps, raw as UploadVideoInput, ctx)),
    }),
    tool('youtube_set_thumbnail', {
      group: 'google',
      description:
        'Set the custom thumbnail of an owned YouTube video from a JPEG or PNG file in the workspace (max 2 MB). The Google Cloud project must be verified for thumbnail updates.',
      input: {
        type: 'object',
        properties: {
          videoId: { type: 'string' },
          imagePath: { type: 'string', description: 'Workspace path to a .jpg/.jpeg/.png file' },
        },
        required: ['videoId', 'imagePath'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      gate: fileAccessGate('read', (input) => (input as SetThumbnailInput).imagePath),
      execute: async (raw, ctx) =>
        runGuard(() => setThumbnailFromWorkspace(deps, raw as SetThumbnailInput, ctx)),
    }),
  ];
}

async function uploadFromWorkspace(
  deps: GoogleToolsDeps,
  input: UploadVideoInput,
  ctx: ToolContext,
): Promise<GoogleYoutubeUploadResult> {
  const videoPath = resolveTarget(ctx, input.videoPath);
  const contentType = contentTypeOf(VIDEO_CONTENT_TYPES, videoPath);
  if (!contentType) {
    throw new Error(`Unsupported video file extension: ${path.extname(videoPath)}`);
  }
  const bytes = await readBounded(videoPath, UPLOAD_BYTES_MAX, 'video');
  const upload: GoogleYoutubeUploadInput = {
    bytes,
    contentType,
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.privacyStatus !== undefined ? { privacyStatus: input.privacyStatus } : {}),
    ...(input.tags !== undefined ? { tags: splitList(input.tags) } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
  };
  return deps.google.uploadVideo(deps.resolveScope(), deps.integrationId, upload);
}

async function setThumbnailFromWorkspace(
  deps: GoogleToolsDeps,
  input: SetThumbnailInput,
  ctx: ToolContext,
): Promise<{ videoId: string; thumbnailSet: true }> {
  const imagePath = resolveTarget(ctx, input.imagePath);
  const contentType = contentTypeOf(IMAGE_CONTENT_TYPES, imagePath);
  if (!contentType) {
    throw new Error(`Thumbnail must be a .jpg or .png file, got: ${path.extname(imagePath)}`);
  }
  const bytes = await readBounded(imagePath, THUMBNAIL_BYTES_MAX, 'thumbnail');
  const thumb: GoogleYoutubeThumbnailInput = { bytes, contentType };
  await deps.google.setThumbnail(deps.resolveScope(), deps.integrationId, input.videoId, thumb);
  return { videoId: input.videoId, thumbnailSet: true };
}

function resolveTarget(ctx: ToolContext, target: string): string {
  const resolved = resolveFileTarget(ctx, target, 'read', {});
  const blocking = firstBlockingPattern(resolved, DEFAULT_PATH_BLOCKLIST);
  if (blocking) {
    throw new Error(`Path is blocked (${blocking}): ${target}`);
  }
  return resolved;
}

async function readBounded(filePath: string, max: number, kind: string): Promise<Uint8Array> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  if (info.size > max) {
    throw new Error(`${kind} file is larger than ${Math.floor(max / 1_000_000)} MB: ${filePath}`);
  }
  return new Uint8Array(await readFile(filePath));
}

function contentTypeOf(table: Record<string, string>, filePath: string): string | undefined {
  return table[path.extname(filePath).toLowerCase()];
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
