import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { sniffImageDimensions } from '../../application/tool-message.ts';
import {
  IMAGE_DOWNSCALE_STEP,
  IMAGE_MIN_DOWNSCALE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIME_MAP,
  VISION_IMAGE_TYPES,
} from '../../constants.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

interface PreparedImage {
  bytes: Uint8Array;
  mediaType: string;
}

export function imageMediaType(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  if (dot < 0) {
    return undefined;
  }
  const mediaType = MIME_MAP[path.slice(dot).toLowerCase()];
  return mediaType && VISION_IMAGE_TYPES.includes(mediaType) ? mediaType : undefined;
}

async function imageDimensions(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const sniffed = sniffImageDimensions(bytes);
  if (sniffed) {
    return sniffed;
  }
  const meta = await new Bun.Image(bytes).metadata();
  return { width: meta.width, height: meta.height };
}

async function withinCaps(bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return false;
  }
  const { width, height } = await imageDimensions(bytes);
  return Math.max(width, height) <= MAX_IMAGE_DIMENSION;
}

export async function prepareImage(bytes: Uint8Array, mediaType: string): Promise<PreparedImage> {
  if (await withinCaps(bytes)) {
    return { bytes, mediaType };
  }
  let image = new Bun.Image(bytes);
  const meta = await image.metadata();
  let width = Math.min(meta.width, MAX_IMAGE_DIMENSION);
  let height = Math.min(meta.height, MAX_IMAGE_DIMENSION);
  let out = await image.resize(width, height, { fit: 'inside' }).jpeg({ quality: 80 }).bytes();
  while (
    (out.byteLength > MAX_IMAGE_BYTES || Math.max(width, height) > MAX_IMAGE_DIMENSION) &&
    Math.min(width, height) > IMAGE_MIN_DOWNSCALE
  ) {
    width = Math.round(width * IMAGE_DOWNSCALE_STEP);
    height = Math.round(height * IMAGE_DOWNSCALE_STEP);
    image = new Bun.Image(bytes);
    out = await image.resize(width, height, { fit: 'inside' }).jpeg({ quality: 80 }).bytes();
  }
  if (out.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large even after downscale (${bytes.byteLength} bytes on input)`);
  }
  return { bytes: out, mediaType: 'image/jpeg' };
}

function extFor(mediaType: string): string {
  return mediaType === 'image/jpeg' ? '.jpg' : `.${mediaType.split('/')[1] ?? 'png'}`;
}

function threadLocator(absolute: string, threadDir: string): string {
  return `thread:${path.relative(threadDir, absolute).split(path.sep).join('/')}`;
}

export function readImageTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('file_read_image', {
    group: 'files',
    description:
      'Read an image file (png, jpeg, webp) and attach it to the conversation so the model can see it in the next turn. Returns a `thread:` locator; files over 3.5 MB or with a long side over 1568 px are downscaled to JPEG, and files outside the thread directory are copied into `thread:sandbox/read-image/`. Use for screenshots, photos, diagrams and scans. Paths starting with `thread:` resolve inside the thread file directory, e.g. `thread:attachments/photo.png` for a file uploaded to this thread.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as { path: string };
      const mediaType = imageMediaType(parsed.path);
      if (!mediaType) {
        throw new Error(`Unsupported image type (png, jpeg, webp are supported): ${parsed.path}`);
      }
      const threadDir = ctx.paths.threadDir;
      if (!threadDir) {
        throw new Error('Thread directory is required for file_read_image');
      }
      const threadRoot = realpathSync(threadDir);
      const absolute = resolveFileTarget(ctx, parsed.path, 'read', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      const file = Bun.file(absolute);
      if (!(await file.exists())) {
        throw new Error(`File not found: ${parsed.path}`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return imageResult(bytes, mediaType, { absolute, threadRoot, threadDir });
    },
  });
}

interface ImageResultContext {
  absolute: string;
  threadRoot: string;
  threadDir: string;
}

async function imageResult(
  bytes: Uint8Array,
  mediaType: string,
  ctx: ImageResultContext,
): Promise<{ ok: true; relPath: string; mediaType: string; kind: 'image' }> {
  if (await withinCaps(bytes)) {
    const insideThread =
      ctx.absolute === ctx.threadRoot || ctx.absolute.startsWith(`${ctx.threadRoot}${path.sep}`);
    if (insideThread) {
      return {
        ok: true,
        relPath: threadLocator(ctx.absolute, ctx.threadRoot),
        mediaType,
        kind: 'image',
      };
    }
  }
  const prepared = await prepareImage(bytes, mediaType);
  const name = `${createHash('sha1').update(bytes).digest('hex')}${extFor(prepared.mediaType)}`;
  const copyAbs = path.join(ctx.threadDir, 'sandbox', 'read-image', name);
  if (!existsSyncSafe(copyAbs)) {
    mkdirSync(path.dirname(copyAbs), { recursive: true });
    writeFileSync(copyAbs, prepared.bytes);
  }
  return {
    ok: true,
    relPath: threadLocator(copyAbs, ctx.threadDir),
    mediaType: prepared.mediaType,
    kind: 'image',
  };
}

function existsSyncSafe(target: string): boolean {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}
