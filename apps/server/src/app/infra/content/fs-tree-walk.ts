import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentEntry, ContentTreeResult } from '@harnesys/contracts';
import { MAX_TREE_ENTRIES } from '@harnesys/contracts';
import ignore from 'ignore';
import { SAFETY_NAMES } from '../../../const.ts';
import {
  ContentNotFoundException,
  ContentPathEscapeException,
} from '../../domain/content/content.error.ts';
import { type GitIgnoreLayer, ignoredByLayers } from '../knowledge/knowledge-walk-ignore.ts';
import { safe, toRel } from './fs-content-ops.ts';

export function listTreeAt(
  root: string,
  relPath: string,
  options?: { includeIgnored?: boolean; depth?: number },
): ContentTreeResult {
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  const st = statSync(abs);
  if (!st.isDirectory()) {
    throw new ContentPathEscapeException('tree path is not a directory');
  }
  const entries: ContentEntry[] = [];
  const truncated = walk(
    {
      root,
      out: entries,
      layers: gitLayersForRoot(root, relPath),
      includeIgnored: options?.includeIgnored === true,
      maxDepth: options?.depth,
    },
    abs,
    relPath,
    1,
  );
  return { entries, truncated };
}

function loadIgnoreLayer(absDir: string, relDir: string): GitIgnoreLayer | undefined {
  const file = join(absDir, '.gitignore');
  if (!existsSync(file)) {
    return undefined;
  }
  return { relDir, ig: ignore().add(readFileSync(file, 'utf8')) };
}

function gitLayersForRoot(root: string, relPath: string): GitIgnoreLayer[] {
  const layers: GitIgnoreLayer[] = [];
  const rootLayer = loadIgnoreLayer(root, '');
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
    const layer = loadIgnoreLayer(accAbs, acc);
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

function walk(ctx: WalkContext, dir: string, relDir: string, level: number): boolean {
  for (const name of readdirSync(dir)) {
    if (ctx.out.length >= MAX_TREE_ENTRIES) {
      return true;
    }
    if (walkEntry(ctx, dir, name, relDir, level)) {
      return true;
    }
  }
  return false;
}

function walkEntry(
  ctx: WalkContext,
  dir: string,
  name: string,
  relDir: string,
  level: number,
): boolean {
  const abs = join(dir, name);
  const st = statSync(abs);
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
  const nested = loadIgnoreLayer(abs, path);
  return walk(
    { root: ctx.root, out: ctx.out, layers: nested ? [...ctx.layers, nested] : ctx.layers },
    abs,
    path,
    level + 1,
  );
}
