import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { MAX_IMAGE_BYTES } from '../../constants.ts';
import type { FileAccessPolicy } from '../../ports/file-access.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { imageMediaType, prepareImage, readImageTool } from './read-image.ts';

const allowAll: FileAccessPolicy = () => ({ decision: 'allow' });

let root: string;
let threadDir: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'harnesys-read-image-'));
  threadDir = path.join(root, 'thread');
  mkdirSync(path.join(threadDir, 'attachments'), { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ctx(cwd: string): ToolContext {
  return { cwd, paths: { allow: [], threadDir }, fileAccess: allowAll };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(new TextEncoder().encode(kind), 4);
  out.set(data, 8);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function makeNoisyPng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowSize = width * 3;
  const raw = new Uint8Array(height * (rowSize + 1));
  crypto.getRandomValues(raw);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowSize + 1)] = 0;
  }
  return Uint8Array.from([
    ...Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    ...pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function writeFixture(dir: string, name: string, bytes: Uint8Array): string {
  const target = path.join(dir, name);
  writeFileSync(target, bytes);
  return target;
}

describe('imageMediaType', () => {
  test('accepts png, jpeg, webp and rejects others', () => {
    expect(imageMediaType('a.png')).toBe('image/png');
    expect(imageMediaType('A.JPG')).toBe('image/jpeg');
    expect(imageMediaType('a.webp')).toBe('image/webp');
    expect(imageMediaType('a.gif')).toBeUndefined();
    expect(imageMediaType('a.svg')).toBeUndefined();
    expect(imageMediaType('a.txt')).toBeUndefined();
    expect(imageMediaType('noext')).toBeUndefined();
  });
});

describe('prepareImage', () => {
  test('passes small images through unchanged', async () => {
    const bytes = makeNoisyPng(8, 8);
    const prepared = await prepareImage(bytes, 'image/png');
    expect(prepared.mediaType).toBe('image/png');
    expect(prepared.bytes).toBe(bytes);
  });

  test('downscales an oversized image to jpeg under the byte limit', async () => {
    const bytes = makeNoisyPng(1900, 1400);
    expect(bytes.byteLength).toBeGreaterThan(MAX_IMAGE_BYTES);
    const prepared = await prepareImage(bytes, 'image/png');
    expect(prepared.mediaType).toBe('image/jpeg');
    expect(prepared.bytes.byteLength).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
  }, 20000);
});

describe('file_read_image tool', () => {
  test('returns the thread locator for a small thread file within caps', async () => {
    const abs = writeFixture(path.join(threadDir, 'attachments'), 'shot.png', makeNoisyPng(32, 32));
    const def = readImageTool();
    const result = (await def.execute({ path: 'thread:attachments/shot.png' }, ctx(threadDir))) as {
      ok: boolean;
      relPath: string;
      mediaType: string;
      kind: string;
    };
    expect(result.ok).toBe(true);
    const expected = path
      .relative(realpathSync(threadDir), realpathSync(abs))
      .split(path.sep)
      .join('/');
    expect(result.relPath).toBe(`thread:${expected}`);
    expect(result.mediaType).toBe('image/png');
    expect(result.kind).toBe('image');
  });

  test('copies a workspace file into sandbox/read-image with a sha1 name, original untouched', async () => {
    const bytes = makeNoisyPng(64, 64);
    const abs = writeFixture(root, 'outside.png', bytes);
    const def = readImageTool();
    const result = (await def.execute({ path: abs }, ctx(root))) as {
      ok: boolean;
      relPath: string;
      mediaType: string;
    };
    expect(result.ok).toBe(true);
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    expect(result.relPath).toBe(`thread:sandbox/read-image/${sha1}.png`);
    const copy = path.join(threadDir, 'sandbox', 'read-image', `${sha1}.png`);
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(abs).equals(Buffer.from(bytes))).toBe(true);
    const repeat = (await def.execute({ path: abs }, ctx(root))) as { relPath: string };
    expect(repeat.relPath).toBe(result.relPath);
  });

  test('rejects unsupported types and missing files', async () => {
    const def = readImageTool();
    const gif = writeFixture(root, 'pic.gif', new Uint8Array([1]));
    await expect(def.execute({ path: gif }, ctx(root))).rejects.toThrow('Unsupported image type');
    await expect(def.execute({ path: path.join(root, 'none.png') }, ctx(root))).rejects.toThrow(
      'File not found',
    );
  });
});
