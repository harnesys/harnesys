import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { headerOf, YOUTUBE_UPLOAD_API, youtubeError, youtubeFetch } from './youtube-client.ts';
import {
  accountOf,
  optionalTextOf,
  requiredTextOf,
  type YoutubeAccountRef,
} from './youtube-input.ts';
import {
  splitList,
  videoSummaryOf,
  type YoutubeVideoSummary,
  type YoutubeVideoWire,
} from './youtube-models.ts';

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1_000_000_000;
const MAX_THUMBNAIL_BYTES = 2_000_000;
const DEFAULT_CATEGORY_ID = '22';
const DEFAULT_PRIVACY = 'private';

interface ChunkUploadInput {
  account: YoutubeAccountRef;
  location: string;
  path: string;
  total: number;
  mediaType: string;
}

const uploadVideo: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const path = requiredTextOf(input, 'path');
  const title = requiredTextOf(input, 'title');
  const account = accountOf(input);
  const info = await ctx.files.stat(path);
  if (info.size === 0) {
    throw new AddonError('invalid_params', { detail: `file is empty: ${path}` });
  }
  if (info.size > MAX_UPLOAD_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is ${info.size} bytes; video uploads are capped at ${MAX_UPLOAD_BYTES} bytes`,
    });
  }
  if (!info.mediaType.startsWith('video/')) {
    throw new AddonError('invalid_params', {
      detail: `not a video file (${info.mediaType}): ${path}`,
    });
  }
  const metadata = {
    snippet: {
      title,
      ...(optionalTextOf(input, 'description') === undefined
        ? {}
        : { description: optionalTextOf(input, 'description') }),
      ...(optionalTextOf(input, 'tags') === undefined
        ? {}
        : { tags: splitList(optionalTextOf(input, 'tags') ?? '') }),
      categoryId: optionalTextOf(input, 'categoryId') ?? DEFAULT_CATEGORY_ID,
    },
    status: { privacyStatus: optionalTextOf(input, 'privacyStatus') ?? DEFAULT_PRIVACY },
  };
  const init = await youtubeFetch(ctx, {
    ...account,
    method: 'POST',
    url: `${YOUTUBE_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`,
    headers: {
      'content-type': 'application/json',
      'x-upload-content-length': String(info.size),
      'x-upload-content-type': info.mediaType,
    },
    body: JSON.stringify(metadata),
  });
  if (init.status < 200 || init.status >= 300) {
    throw youtubeError(init.status, init.text);
  }
  const location = headerOf(init.headers, 'location');
  if (location === undefined || location === '') {
    throw new AddonError('invalid_response', {
      detail: 'YouTube did not return a resumable upload location',
    });
  }
  const uploaded = await sendChunks(ctx, {
    account,
    location,
    path,
    total: info.size,
    mediaType: info.mediaType,
  });
  const summary = videoSummaryOf(uploaded);
  await ctx.log.info('youtube video uploaded', {
    videoId: summary.id,
    path,
    size: info.size,
  });
  return { video: summary } satisfies { video: YoutubeVideoSummary };
};

const setThumbnail: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const videoId = requiredTextOf(input, 'videoId');
  const path = requiredTextOf(input, 'path');
  const info = await ctx.files.stat(path);
  if (info.size > MAX_THUMBNAIL_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `thumbnail is ${info.size} bytes; the limit is ${MAX_THUMBNAIL_BYTES} bytes`,
    });
  }
  if (info.mediaType !== 'image/jpeg' && info.mediaType !== 'image/png') {
    throw new AddonError('invalid_params', {
      detail: `thumbnail must be JPEG or PNG, got ${info.mediaType}`,
    });
  }
  const chunk = await ctx.files.read({ path });
  const response = await youtubeFetch(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: `${YOUTUBE_UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    headers: { 'content-type': info.mediaType },
    bodyBase64: chunk.data,
  });
  if (response.status < 200 || response.status >= 300) {
    throw youtubeError(response.status, response.text);
  }
  await ctx.log.info('youtube thumbnail set', { videoId, path });
  return { videoId, thumbnailSet: true } satisfies { videoId: string; thumbnailSet: boolean };
};

async function sendChunks(ctx: AddonContext, input: ChunkUploadInput): Promise<YoutubeVideoWire> {
  let offset = 0;
  let status = 0;
  let body: string | null = null;
  while (offset < input.total) {
    if (ctx.signal.aborted) {
      throw new AddonError('cancelled', { detail: 'video upload cancelled' });
    }
    const length = Math.min(CHUNK_BYTES, input.total - offset);
    const chunk = await ctx.files.read({ path: input.path, offset, length });
    const end = offset + length - 1;
    const response = await youtubeFetch(ctx, {
      ...input.account,
      method: 'PUT',
      url: input.location,
      headers: {
        'content-type': input.mediaType,
        'content-range': `bytes ${offset}-${end}/${input.total}`,
      },
      bodyBase64: chunk.data,
    });
    if (response.status >= 400) {
      throw youtubeError(response.status, response.text);
    }
    offset += length;
    status = response.status;
    body = response.text;
    if (status === 200 || status === 201) {
      break;
    }
  }
  if ((status !== 200 && status !== 201) || body === null) {
    throw new AddonError('invalid_response', {
      detail: `video upload finished with status ${status}`,
    });
  }
  try {
    return JSON.parse(body) as YoutubeVideoWire;
  } catch {
    throw new AddonError('invalid_response', { detail: 'YouTube returned invalid upload JSON' });
  }
}

export const uploadTools: Record<string, ToolHandler> = {
  upload_video: uploadVideo,
  set_thumbnail: setThumbnail,
};
