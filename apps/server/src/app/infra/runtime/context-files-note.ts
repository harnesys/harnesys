import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  BINARY_PROBE_BYTES,
  type ContextFileRunEntry,
  type ContextFileSkipReason,
  DEFAULT_PATH_BLOCKLIST,
  isPathBlocked,
} from 'harnesys';
import { contextFilesOf, type ThreadPolicy } from '../../domain/thread/thread-policy.ts';

/** Per-file ceiling: a huge rules file must not crowd out the conversation. */
export const CONTEXT_FILE_MAX_CHARS = 32 * 1024;

/** Total ceiling across every injected file. */
export const CONTEXT_FILES_TOTAL_CHARS = 64 * 1024;

const TRUNCATED_MARKER = '\n\n[truncated]';

export interface ResolvedContextFiles {
  /** Ready-to-inject system block, absent when nothing was actually loaded. */
  note?: string;
  /** One row per configured file, including skipped ones, in rank order. */
  entries: ContextFileRunEntry[];
}

interface LoadedFile {
  path: string;
  text: string;
  truncated: boolean;
}

/**
 * Reads the thread's context files from the run root and renders them as one
 * system block. Priority follows the order of the list: the first file wins on
 * conflicts, which the rendered header states so the model at least has the
 * chance to comply.
 *
 * This never throws. A missing, blocked, binary or unreadable file degrades to
 * a skipped entry — a thread that lost its AGENTS.md must still be able to run.
 */
export function resolveContextFiles(
  policy: ThreadPolicy,
  primaryDirectory: string,
): ResolvedContextFiles {
  const entries: ContextFileRunEntry[] = [];
  const loaded: LoadedFile[] = [];
  let budget = CONTEXT_FILES_TOTAL_CHARS;

  for (const file of contextFilesOf(policy)) {
    if (!file.enabled) {
      continue;
    }
    const result = loadContextFile(primaryDirectory, file.path, budget);
    if ('skipped' in result) {
      entries.push({ path: file.path, chars: 0, skipped: result.skipped });
      continue;
    }
    budget -= result.text.length;
    entries.push({
      path: file.path,
      chars: result.text.length,
      ...(result.truncated ? { skipped: 'truncated' as const } : {}),
    });
    loaded.push({ path: file.path, text: result.text, truncated: result.truncated });
  }

  if (loaded.length === 0) {
    return { entries };
  }
  return { note: renderNote(loaded), entries };
}

function renderNote(files: readonly LoadedFile[]): string {
  const header = [
    'The following project files are injected for this run, in priority order.',
    'On conflict, the earlier file wins over later ones.',
  ].join(' ');
  const blocks = files.map((file) => `<file path="${file.path}">\n${file.text}\n</file>`);
  return [header, ...blocks].join('\n');
}

function loadContextFile(
  root: string,
  relativePath: string,
  budget: number,
): { text: string; truncated: boolean } | { skipped: ContextFileSkipReason } {
  try {
    const absolute = resolve(root, relativePath);
    if (!isInsideRoot(root, absolute)) {
      return { skipped: 'outside-root' };
    }
    if (!existsSync(absolute)) {
      return { skipped: 'missing' };
    }
    // Symlinks can point anywhere: the resolved target decides, not the name.
    const realRoot = realpathSync(root);
    const realFile = realpathSync(absolute);
    if (!isInsideRoot(realRoot, realFile)) {
      return { skipped: 'outside-root' };
    }
    if (isPathBlocked(realFile, DEFAULT_PATH_BLOCKLIST)) {
      return { skipped: 'blocked' };
    }
    if (!statSync(realFile).isFile()) {
      return { skipped: 'missing' };
    }
    const buffer = readFileSync(realFile);
    if (buffer.length === 0) {
      return { skipped: 'empty' };
    }
    if (isBinary(buffer)) {
      return { skipped: 'binary' };
    }
    const cutoff = Math.min(buffer.length, CONTEXT_FILE_MAX_CHARS);
    const text = stripBom(buffer.subarray(0, cutoff).toString('utf8')).trimEnd();
    if (text.trim().length === 0) {
      return { skipped: 'empty' };
    }
    const truncated = cutoff < buffer.length;
    const rendered = truncated ? `${text}${TRUNCATED_MARKER}` : text;
    // Budget is all-or-nothing per file: half a rules file is worse than none,
    // and the header would still claim it is fully in effect.
    if (rendered.length > budget) {
      return { skipped: 'budget' };
    }
    return { text: rendered, truncated };
  } catch {
    return { skipped: 'read-error' };
  }
}

function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  if (rel.length === 0 || isAbsolute(rel)) {
    return rel.length === 0;
  }
  return rel !== '..' && !rel.startsWith(`..${sep}`);
}

function isBinary(buffer: Uint8Array): boolean {
  const probe = buffer.subarray(0, BINARY_PROBE_BYTES);
  for (const byte of probe) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
