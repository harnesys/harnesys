import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { ContentEntry, ContentStat, ContentTreeResult } from '@harnesys/contracts';
import { MAX_DOWNLOAD_BYTES, MAX_EDITOR_BYTES, MAX_TREE_ENTRIES } from '@harnesys/contracts';
import ignore from 'ignore';
import { SAFETY_NAMES } from '../../../const.ts';
import {
  ContentAlreadyExistsException,
  ContentConflictException,
  ContentNotFoundException,
  ContentPathEscapeException,
  ContentTooLargeException,
} from '../../domain/content/content.error.ts';
import type {
  ContentReadResult,
  ContentWriteResult,
} from '../../domain/content/org-content.port.ts';
import { type GitIgnoreLayer, ignoredByLayers } from '../knowledge/knowledge-walk-ignore.ts';
import { PathJailEscapeError, resolveSafe } from './path-jail.ts';

export function resolveContentRoot(absolutePath: string): string {
  const resolved = resolve(absolutePath);
  if (!existsSync(resolved)) {
    throw new ContentNotFoundException('');
  }
  return realpathSync(resolved);
}

export function listTreeAt(root: string, relPath: string): ContentTreeResult {
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
    { root, out: entries, layers: gitLayersForRoot(root, relPath) },
    abs,
    relPath,
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

export function readAt(root: string, relPath: string): ContentReadResult {
  const abs = safe(root, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new ContentNotFoundException(relPath);
  }
  const st = statSync(abs);
  if (st.size > MAX_EDITOR_BYTES) {
    throw new ContentTooLargeException(st.size, MAX_EDITOR_BYTES);
  }
  const bytes = new Uint8Array(readFileSync(abs));
  return {
    bytes,
    etag: makeEtag(st.mtimeMs, st.size),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

export function writeAt(
  root: string,
  relPath: string,
  bytes: Uint8Array,
  ifMatch?: string | null,
): ContentWriteResult {
  if (bytes.byteLength > MAX_EDITOR_BYTES) {
    throw new ContentTooLargeException(bytes.byteLength, MAX_EDITOR_BYTES);
  }
  const abs = safe(root, relPath);
  if (existsSync(abs)) {
    const st = statSync(abs);
    if (!st.isFile()) {
      throw new ContentPathEscapeException('cannot write to directory');
    }
    const current = makeEtag(st.mtimeMs, st.size);
    if (ifMatch && ifMatch !== current) {
      throw new ContentConflictException(relPath);
    }
  } else if (ifMatch) {
    throw new ContentConflictException(relPath);
  }
  mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
  writeFileSync(abs, bytes);
  const st = statSync(abs);
  return { etag: makeEtag(st.mtimeMs, st.size) };
}

export function mkdirAt(root: string, relPath: string): void {
  const abs = safe(root, relPath);
  mkdirSync(abs, { recursive: true, mode: 0o700 });
}

export function removeAt(root: string, relPath: string): void {
  if (relPath === '' || relPath === '.') {
    throw new ContentPathEscapeException('cannot remove source root');
  }
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  rmSync(abs, { recursive: true, force: true });
}

export function moveAt(root: string, fromRel: string, toRel: string): void {
  if (!fromRel || fromRel === '.' || !toRel || toRel === '.') {
    throw new ContentPathEscapeException('cannot move source root');
  }
  const fromAbs = safe(root, fromRel);
  const toAbs = safe(root, toRel);
  if (!existsSync(fromAbs)) {
    throw new ContentNotFoundException(fromRel);
  }
  if (existsSync(toAbs)) {
    throw new ContentAlreadyExistsException(toRel);
  }
  mkdirSync(dirname(toAbs), { recursive: true, mode: 0o700 });
  try {
    renameSync(fromAbs, toAbs);
    return;
  } catch (err) {
    if (!isExdev(err)) {
      throw err;
    }
  }
  cpSync(fromAbs, toAbs, { recursive: true, errorOnExist: true, force: false });
  rmSync(fromAbs, { recursive: true, force: true });
}

function isExdev(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'EXDEV';
}

export function statAt(root: string, relPath: string): ContentStat {
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  const st = statSync(abs);
  return {
    path: toRel(root, abs),
    type: st.isDirectory() ? 'dir' : 'file',
    size: st.size,
    mtime: st.mtime.toISOString(),
    etag: makeEtag(st.mtimeMs, st.size),
  };
}

export interface ContentDownloadResult {
  name: string;
  bytes: Uint8Array;
}

export function duplicateAt(root: string, relPath: string): ContentStat {
  if (relPath === '' || relPath === '.') {
    throw new ContentPathEscapeException('cannot duplicate source root');
  }
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  const target = join(dirname(abs), duplicateName(dirname(abs), basename(abs)));
  cpSync(abs, target, { recursive: true });
  return statAt(root, toRel(root, target));
}

export function revealAt(root: string, relPath: string): void {
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  if (process.platform === 'darwin') {
    spawn('open', ['-R', abs], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [dirname(abs)], { stdio: 'ignore', detached: true }).unref();
}

export function downloadAt(root: string, relPath: string): ContentDownloadResult {
  const abs = safe(root, relPath);
  if (!existsSync(abs)) {
    throw new ContentNotFoundException(relPath);
  }
  const name = basename(abs);
  if (statSync(abs).isFile()) {
    return { name, bytes: downloadFileAt(abs, name) };
  }
  return { name: `${name}.zip`, bytes: downloadDirAt(abs, name) };
}

function downloadFileAt(abs: string, _name: string): Uint8Array {
  const st = statSync(abs);
  if (st.size > MAX_DOWNLOAD_BYTES) {
    throw new ContentTooLargeException(st.size, MAX_DOWNLOAD_BYTES);
  }
  return new Uint8Array(readFileSync(abs));
}

function downloadDirAt(abs: string, name: string): Uint8Array {
  let zipped: Buffer;
  try {
    zipped = execFileSync('zip', ['-rq', '-', name], {
      cwd: dirname(abs),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'buffer',
      maxBuffer: MAX_DOWNLOAD_BYTES,
    });
  } catch {
    throw new ContentTooLargeException(0, MAX_DOWNLOAD_BYTES);
  }
  if (zipped.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new ContentTooLargeException(zipped.byteLength, MAX_DOWNLOAD_BYTES);
  }
  return new Uint8Array(zipped);
}

function duplicateName(parent: string, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`;
    if (!existsSync(join(parent, candidate))) {
      return candidate;
    }
  }
  throw new ContentConflictException(name);
}

export function safe(root: string, relPath: string): string {
  try {
    return resolveSafe(root, relPath);
  } catch (err) {
    if (err instanceof PathJailEscapeError) {
      throw new ContentPathEscapeException(err.message);
    }
    throw err;
  }
}

interface WalkContext {
  root: string;
  out: ContentEntry[];
  layers: GitIgnoreLayer[];
}

function walk(ctx: WalkContext, dir: string, relDir: string): boolean {
  for (const name of readdirSync(dir)) {
    if (ctx.out.length >= MAX_TREE_ENTRIES) {
      return true;
    }
    if (SAFETY_NAMES.has(name)) {
      continue;
    }
    if (walkEntry(ctx, dir, name, relDir)) {
      return true;
    }
  }
  return false;
}

function walkEntry(ctx: WalkContext, dir: string, name: string, relDir: string): boolean {
  const abs = join(dir, name);
  const st = statSync(abs);
  const isDir = st.isDirectory();
  const path = toRel(ctx.root, abs);
  if (ignoredByLayers(ctx.layers, relDir ? `${relDir}/${name}` : name, isDir)) {
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
  const nested = loadIgnoreLayer(abs, path);
  return walk(
    { root: ctx.root, out: ctx.out, layers: nested ? [...ctx.layers, nested] : ctx.layers },
    abs,
    path,
  );
}

function makeEtag(mtimeMs: number, size: number): string {
  return `"${mtimeMs.toString(16)}-${size.toString(16)}"`;
}

function toRel(root: string, abs: string): string {
  const rel = relative(root, abs);
  return rel.split(sep).join('/');
}
