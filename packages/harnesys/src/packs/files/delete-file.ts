import { lstat, rm } from 'node:fs/promises';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { globMatches } from './glob.ts';
import { withPathLock } from './path-lock.ts';

interface DeleteFileInput {
  path?: string;
  pattern?: string;
  recursive?: boolean;
  dry_run?: boolean;
}

interface DeleteFailure {
  path: string;
  error: string;
}

export function deleteFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('delete_file', {
    group: 'files',
    description:
      'Delete a file by path, or files matching a glob pattern, inside a source granted Write access. ' +
      'Pattern deletes are dry-run unless dry_run is false; matches without write access are skipped.',
    operations: ['fs.write'],
    sideEffect: 'destructive',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        pattern: { type: 'string' },
        recursive: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      },
    },
    gate: fileAccessGate('edit', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as DeleteFileInput;
      if (parsed.path === undefined && parsed.pattern === undefined) {
        throw new Error('Provide either path or pattern');
      }
      if (parsed.path !== undefined && parsed.pattern !== undefined) {
        throw new Error('Provide either path or pattern, not both');
      }
      if (parsed.path !== undefined) {
        return deletePath(parsed, ctx, options, blocklist);
      }
      return deletePattern(parsed, ctx, options, blocklist);
    },
  });
}

async function deletePath(
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  const target = parsed.path ?? '';
  const absolute = resolveFileTarget(ctx, target, 'edit', options);
  assertNotWorkdirRoot(ctx, absolute, target);
  assertNotBlocked(absolute, target, blocklist);
  return withPathLock(absolute, async () => {
    const info = await lstat(absolute).catch(() => {
      throw new Error(`Path not found: ${target}`);
    });
    const kind = info.isDirectory() ? 'dir' : 'file';
    if (parsed.dry_run === true) {
      return { path: target, kind, deleted: 0, dry_run: true };
    }
    if (info.isDirectory() && parsed.recursive !== true) {
      throw new Error(`Is a directory: ${target}; pass recursive: true to delete it with contents`);
    }
    await rm(absolute, { recursive: parsed.recursive === true });
    return { path: target, kind, deleted: 1, dry_run: false };
  });
}

async function deletePattern(
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  const pattern = parsed.pattern ?? '';
  const matches = await globMatches(ctx, pattern, options, 'edit');
  if (parsed.dry_run !== false) {
    return { pattern, matches, deleted: 0, dry_run: true };
  }
  const failed: DeleteFailure[] = [];
  let deleted = 0;
  for (const match of matches) {
    try {
      const absolute = resolveFileTarget(ctx, match, 'edit', options);
      assertNotBlocked(absolute, match, blocklist);
      await withPathLock(absolute, () => rm(absolute));
      deleted += 1;
    } catch (error) {
      failed.push({ path: match, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { pattern, matches, deleted, failed, dry_run: false };
}

function assertNotBlocked(absolute: string, target: string, blocklist: readonly string[]): void {
  const blocking = firstBlockingPattern(absolute, blocklist);
  if (blocking) {
    throw new Error(`Path is blocked (${blocking}): ${target}`);
  }
}

function assertNotWorkdirRoot(ctx: ToolContext, absolute: string, target: string): void {
  const workdir = resolveWorkdirPath(ctx.cwd, '.');
  if (absolute === workdir) {
    throw new Error(`Refusing to delete the run workdir itself: ${target}`);
  }
}
