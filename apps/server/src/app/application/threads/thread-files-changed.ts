import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ThreadFileRoot } from '@harnesys/contracts';
import { asObject, parseJson, str } from '@harnesys/studio-shared';
import type { SessionEvent } from 'harnesys';

const PATH_KEYS: readonly string[] = ['path', 'paths', 'from', 'to', 'pattern'];
const BATCH_KEYS: readonly string[] = ['files', 'edits', 'moves', 'patches'];

export function threadFileRootOfPath(raw: string, threadDir: string): ThreadFileRoot | null {
  const trimmed = raw.replaceAll('\\', '/');
  if (!trimmed || trimmed.includes('\0')) {
    return null;
  }
  const absolute = isAbsolute(trimmed) ? resolve(trimmed) : resolve(threadDir, trimmed);
  const rel = relative(resolve(threadDir), absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  const [root] = rel.replaceAll('\\', '/').split('/');
  if (!root || root.startsWith('.')) {
    return null;
  }
  if (root === 'attachments' || root === 'tool-outputs') {
    return root;
  }
  return 'thread';
}

export function threadFileRootsFromEvents(
  events: readonly SessionEvent[],
  threadDir: string,
): ThreadFileRoot[] {
  const roots = new Set<ThreadFileRoot>();
  for (const event of events) {
    if (event.type === 'tool' && event.phase === 'completed') {
      addToolEventRoots(event, threadDir, roots);
    }
  }
  return [...roots].sort();
}

function addToolEventRoots(
  event: Extract<SessionEvent, { type: 'tool' }>,
  threadDir: string,
  roots: Set<ThreadFileRoot>,
): void {
  if (event.sideEffect === 'write' || event.sideEffect === 'destructive') {
    const paths = inputPathsOf(event.input);
    if (paths.length === 0) {
      roots.add('thread');
    }
    for (const candidate of paths) {
      const root = threadFileRootOfPath(candidate, threadDir);
      if (root !== null) {
        roots.add(root);
      }
    }
  }
  if (outputHasAttachmentId(event.output)) {
    roots.add('attachments');
  }
}

function inputPathsOf(input: unknown): string[] {
  const out: string[] = [];
  collectPathStrings(input, 0, false, out);
  return out;
}

function collectPathStrings(value: unknown, depth: number, pathKey: boolean, out: string[]): void {
  if (depth > 3) {
    return;
  }
  if (typeof value === 'string') {
    if (pathKey) {
      out.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathStrings(item, depth + 1, pathKey, out);
    }
    return;
  }
  const obj = asObject(value);
  if (!obj) {
    return;
  }
  for (const [key, field] of Object.entries(obj)) {
    const nestedPathKey = PATH_KEYS.includes(key) || BATCH_KEYS.includes(key);
    if (nestedPathKey) {
      collectPathStrings(field, depth + 1, PATH_KEYS.includes(key), out);
    }
  }
}

function outputHasAttachmentId(output: unknown): boolean {
  const parsed = typeof output === 'string' ? parseJson(output) : output;
  return Boolean(str(asObject(parsed), 'attachmentId'));
}
