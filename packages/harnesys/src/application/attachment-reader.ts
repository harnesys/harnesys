import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { MIME_MAP } from '../constants.ts';
import type { FileAccessPolicy } from '../ports/file-access.ts';
import type { PathsConfig } from '../ports/paths.ts';

export type AttachmentReadReason = 'file_missing' | 'read_error' | 'policy_denied';

export interface AttachmentFile {
  bytes: Uint8Array;
  mediaType?: string;
}

export interface AttachmentReaderInput {
  paths?: PathsConfig;
  fileAccess?: FileAccessPolicy;
}

export type AttachmentFileReader = (locator: string) => AttachmentFile;

interface AttachmentError extends Error {
  reason: AttachmentReadReason;
}

const LEGACY_THREAD_PREFIXES = ['attachments/', 'sandbox/'];

function readError(reason: AttachmentReadReason, message: string): AttachmentError {
  const error = new Error(message) as AttachmentError;
  error.reason = reason;
  return error;
}

function baseOf(paths: PathsConfig | undefined): string {
  return paths?.cwd ?? process.cwd();
}

function exists(candidate: string): boolean {
  try {
    statSync(candidate);
    return true;
  } catch {
    return false;
  }
}

export function resolveThreadPath(locator: string, paths: PathsConfig | undefined): string {
  if (locator.startsWith('thread:')) {
    const relative = locator.slice('thread:'.length);
    return path.join(paths?.threadDir ?? baseOf(paths), relative);
  }
  if (path.isAbsolute(locator)) {
    return path.resolve(locator);
  }
  const normalized = locator.replaceAll('\\', '/');
  if (paths?.threadDir && LEGACY_THREAD_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    const candidate = path.join(paths.threadDir, locator);
    if (exists(candidate)) {
      return candidate;
    }
  }
  return path.join(baseOf(paths), locator);
}

export function assertReadable(
  abs: string,
  input: { paths?: PathsConfig; fileAccess?: FileAccessPolicy },
): void {
  let resolved: string;
  try {
    resolved = realpathSync(abs);
  } catch {
    throw readError('file_missing', `File not found: ${abs}`);
  }
  if (input.fileAccess) {
    const gate = input.fileAccess({ path: resolved, action: 'read' });
    if (gate.decision === 'deny') {
      throw readError('policy_denied', `File access denied: ${abs} (${gate.reason})`);
    }
    if (gate.decision === 'ask') {
      throw readError('policy_denied', `File access requires approval: ${abs}`);
    }
    return;
  }
  const roots = [input.paths?.cwd, input.paths?.threadDir].filter((root) => root !== undefined);
  if (roots.length === 0) {
    roots.push(process.cwd());
  }
  const allowed = roots.some((root) => {
    const realRoot = realpathSync(root);
    return resolved === realRoot || resolved.startsWith(`${realRoot}${path.sep}`);
  });
  if (!allowed) {
    throw readError('policy_denied', `Path escapes allowed roots: ${abs}`);
  }
}

export function readFileBytes(abs: string): AttachmentFile {
  try {
    const bytes = new Uint8Array(readFileSync(abs));
    const dot = abs.lastIndexOf('.');
    const mediaType = dot < 0 ? undefined : MIME_MAP[abs.slice(dot).toLowerCase()];
    return { bytes, mediaType };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw readError('file_missing', `File not found: ${abs}`);
    }
    throw readError('read_error', `Failed to read file: ${abs}`);
  }
}

export function attachmentReader(input: AttachmentReaderInput): AttachmentFileReader {
  return (locator) => {
    const abs = resolveThreadPath(locator, input.paths);
    assertReadable(abs, input);
    return readFileBytes(abs);
  };
}
