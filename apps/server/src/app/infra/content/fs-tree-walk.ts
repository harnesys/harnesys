import type { Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContentEntry, ContentTreeResult } from '@harnesys/contracts';
import { MAX_TREE_ENTRIES } from '@harnesys/contracts';
import { SAFETY_NAMES } from '../../../const.ts';
import {
  ContentNotFoundException,
  ContentPathEscapeException,
} from '../../domain/content/content.error.ts';
import {
  type GitIgnoreLayer,
  ignoredByLayers,
  loadIgnoreFile,
} from '../knowledge/knowledge-walk-ignore.ts';
import { safe, toRel } from './fs-content-ops.ts';

export async function listTreeAt(
  root: string,
  relPath: string,
  options?: { includeIgnored?: boolean; depth?: number },
): Promise<ContentTreeResult> {
  const abs = safe(root, relPath);
  const st = await stat(abs).catch(() => undefined);
  if (st === undefined) {
    throw new ContentNotFoundException(relPath);
  }
  if (!st.isDirectory()) {
    throw new ContentPathEscapeException('tree path is not a directory');
  }
  const entries: ContentEntry[] = [];
  const truncated = await walk(
    {
      root,
      out: entries,
      layers: await gitLayersForRoot(root, relPath),
      includeIgnored: options?.includeIgnored === true,
      maxDepth: options?.depth,
    },
    abs,
    relPath,
    1,
  );
  return { entries, truncated };
}

async function loadIgnoreLayer(
  absDir: string,
  relDir: string,
): Promise<GitIgnoreLayer | undefined> {
  const ig = await loadIgnoreFile(join(absDir, '.gitignore'));
  return ig === undefined ? undefined : { relDir, ig };
}

async function gitLayersForRoot(root: string, relPath: string): Promise<GitIgnoreLayer[]> {
  const layers: GitIgnoreLayer[] = [];
  const rootLayer = await loadIgnoreLayer(root, '');
  if (rootLayer) {
    layers.push(rootLayer);
  }
  if (!relPath) {
    return layers;
  }
  const parts = relPath.split('/');
  let acc = '';
  let accAbs = root;
  for (const part of parts) {
    accAbs = join(accAbs, part);
    acc = acc ? `${acc}/${part}` : part;
    const layer = await loadIgnoreLayer(accAbs, acc);
    if (layer) {
      layers.push(layer);
    }
  }
  return layers;
}

interface WalkContext {
  root: string;
  out: ContentEntry[];
  layers: GitIgnoreLayer[];
  includeIgnored?: boolean;
  maxDepth?: number;
}

async function walk(
  ctx: WalkContext,
  dir: string,
  relDir: string,
  level: number,
): Promise<boolean> {
  for (const name of await readdir(dir)) {
    if (ctx.out.length >= MAX_TREE_ENTRIES) {
      return true;
    }
    if (await walkEntry(ctx, dir, name, relDir, level)) {
      return true;
    }
  }
  return false;
}

async function walkEntry(
  ctx: WalkContext,
  dir: string,
  name: string,
  relDir: string,
  level: number,
): Promise<boolean> {
  const abs = join(dir, name);
  const st = await stat(abs).catch((cause: unknown) => {
    if (isMissingEntry(cause)) {
      return undefined;
    }
    throw cause;
  });
  return st !== undefined && (await walkStatEntry({ ...ctx, dir: abs, name }, st, relDir, level));
}

function isMissingEntry(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

interface WalkEntry {
  dir: string;
  name: string;
}

async function walkStatEntry(
  ctx: WalkEntry & WalkContext,
  st: Stats,
  relDir: string,
  level: number,
): Promise<boolean> {
  const abs = ctx.dir;
  const name = ctx.name;
  const isDir = st.isDirectory();
  const path = toRel(ctx.root, abs);
  const relName = relDir ? `${relDir}/${name}` : name;
  const ignored = SAFETY_NAMES.has(name) || ignoredByLayers(ctx.layers, relName, isDir);
  if (ignored && !ctx.includeIgnored) {
    return false;
  }
  if (ignored) {
    if (isDir) {
      ctx.out.push({ name, path, type: 'dir', mtime: st.mtime.toISOString(), ignored: true });
      return false;
    }
    if (st.isFile()) {
      ctx.out.push({
        name,
        path,
        type: 'file',
        size: st.size,
        mtime: st.mtime.toISOString(),
        ignored: true,
      });
    }
    return false;
  }
  if (!isDir) {
    if (st.isFile()) {
      ctx.out.push({
        name,
        path,
        type: 'file',
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    }
    return false;
  }
  ctx.out.push({ name, path, type: 'dir', mtime: st.mtime.toISOString() });
  if (ctx.maxDepth !== undefined && level >= ctx.maxDepth) {
    return false;
  }
  const nested = await loadIgnoreLayer(abs, path);
  return await walk(
    { root: ctx.root, out: ctx.out, layers: nested ? [...ctx.layers, nested] : ctx.layers },
    abs,
    path,
    level + 1,
  );
}
