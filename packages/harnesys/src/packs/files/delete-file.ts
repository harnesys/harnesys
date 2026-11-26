import { lstat, rm } from 'node:fs/promises';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGateAll, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { globMatches } from './glob.ts';
import { withPathLock } from './path-lock.ts';

interface DeleteFileInput {
  path?: string;
  paths?: string[];
  pattern?: string;
  recursive?: boolean;
  dry_run?: boolean;
}

interface DeleteFailure {
  path: string;
  error: string;
}

interface DeleteOutcome {
  kind: 'file' | 'dir';
  dryRun: boolean;
}

export function deleteFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('delete_file', {
    group: 'files',
    description:
      'Delete files inside a source granted Write access: one path, a paths batch, or a glob pattern. ' +
      'Pattern deletes are dry-run unless dry_run is false; matches without write access are skipped; directories need recursive: true.',
    operations: ['fs.write'],
    sideEffect: 'destructive',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        pattern: { type: 'string' },
        recursive: { type: 'boolean' },
        dry_run: { type: 'boolean' },
      },
    },
    gate: fileAccessGateAll('edit', [(input) => deleteTargets(input as DeleteFileInput)]),
    async execute(input, ctx) {
      const parsed = input as DeleteFileInput;
      return runDelete(parsed, ctx, options, blocklist);
    },
  });
}

async function runDelete(
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  const modes = modeKeys(parsed);
  if (modes.length !== 1) {
    throw new Error(`Provide exactly one of path, paths, or pattern (got: ${modes.length})`);
  }
  if (parsed.path !== undefined) {
    const outcome = await deleteOneTarget(parsed.path, parsed, ctx, options, blocklist);
    return {
      path: parsed.path,
      kind: outcome.kind,
      deleted: outcome.dryRun ? 0 : 1,
      dry_run: outcome.dryRun,
    };
  }
  if (parsed.paths !== undefined) {
    return deleteBatch(parsed.paths, parsed, ctx, options, blocklist);
  }
  return deletePattern(parsed.pattern ?? '', parsed, ctx, options, blocklist);
}

async function deleteBatch(
  targets: string[],
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  if (targets.length === 0) {
    throw new Error('paths is empty');
  }
  const failed: DeleteFailure[] = [];
  let deleted = 0;
  let dryRun = false;
  for (const target of targets) {
    try {
      const outcome = await deleteOneTarget(target, parsed, ctx, options, blocklist);
      if (outcome.dryRun) {
        dryRun = true;
      } else {
        deleted += 1;
      }
    } catch (error) {
      failed.push({ path: target, error: failureMessage(error) });
    }
  }
  return { paths: targets, deleted, failed, dry_run: dryRun };
}

async function deletePattern(
  pattern: string,
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
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
      failed.push({ path: match, error: failureMessage(error) });
    }
  }
  return { pattern, matches, deleted, failed, dry_run: false };
}

async function deleteOneTarget(
  target: string,
  parsed: DeleteFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<DeleteOutcome> {
  const absolute = resolveFileTarget(ctx, target, 'edit', options);
  assertNotWorkdirRoot(ctx, absolute, target);
  assertNotBlocked(absolute, target, blocklist);
  return withPathLock(absolute, async () => {
    const info = await lstat(absolute).catch(() => {
      throw new Error(`Path not found: ${target}`);
    });
    const kind = info.isDirectory() ? 'dir' : 'file';
    if (parsed.dry_run === true) {
      return { kind, dryRun: true };
    }
    if (info.isDirectory() && parsed.recursive !== true) {
      throw new Error(`Is a directory: ${target}; pass recursive: true to delete it with contents`);
    }
    await rm(absolute, { recursive: parsed.recursive === true });
    return { kind, dryRun: false };
  });
}

function deleteTargets(parsed: DeleteFileInput): string | string[] | undefined {
  if (parsed.path !== undefined) {
    return parsed.path;
  }
  return parsed.paths;
}

function modeKeys(parsed: DeleteFileInput): string[] {
  const modes: string[] = [];
  if (parsed.path !== undefined) {
    modes.push('path');
  }
  if (parsed.paths !== undefined) {
    modes.push('paths');
  }
  if (parsed.pattern !== undefined) {
    modes.push('pattern');
  }
  return modes;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
