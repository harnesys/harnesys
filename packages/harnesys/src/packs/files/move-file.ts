import { lstat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGateAll, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';

interface MovePair {
  from: string;
  to: string;
}

interface MoveFileInput {
  from?: string;
  to?: string;
  moves?: MovePair[];
  overwrite?: boolean;
}

interface MoveFailure {
  from: string;
  to: string;
  error: string;
}

export function moveFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('move_file', {
    group: 'files',
    description:
      'Move or rename files inside a source granted Write access: one from/to pair or a moves batch. ' +
      'Creates the target parent directory; refuses an existing target unless overwrite is true.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        moves: {
          type: 'array',
          items: {
            type: 'object',
            properties: { from: { type: 'string' }, to: { type: 'string' } },
            required: ['from', 'to'],
          },
        },
        overwrite: { type: 'boolean' },
      },
    },
    gate: fileAccessGateAll('edit', [(input) => moveTargets(input as MoveFileInput)]),
    async execute(input, ctx) {
      const parsed = input as MoveFileInput;
      return runMove(parsed, ctx, options, blocklist);
    },
  });
}

function moveTargets(parsed: MoveFileInput): string[] {
  if (parsed.moves !== undefined) {
    return parsed.moves.flatMap((pair) => [pair.from, pair.to]);
  }
  return [parsed.from, parsed.to].filter((target): target is string => target !== undefined);
}

async function runMove(
  parsed: MoveFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  if (parsed.moves !== undefined && (parsed.from !== undefined || parsed.to !== undefined)) {
    throw new Error('Provide either from/to or moves, not both');
  }
  if (parsed.moves !== undefined) {
    return moveBatch(parsed.moves, parsed, ctx, options, blocklist);
  }
  if (parsed.from === undefined || parsed.to === undefined) {
    throw new Error('Provide from and to, or a moves array');
  }
  const pair: MovePair = { from: parsed.from, to: parsed.to };
  return moveOne(pair, parsed, ctx, options, blocklist);
}

async function moveBatch(
  moves: MovePair[],
  parsed: MoveFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  if (moves.length === 0) {
    throw new Error('moves is empty');
  }
  const failed: MoveFailure[] = [];
  let moved = 0;
  for (const pair of moves) {
    try {
      await moveOne(pair, parsed, ctx, options, blocklist);
      moved += 1;
    } catch (error) {
      failed.push({
        from: pair.from,
        to: pair.to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { moved, failed };
}

async function moveOne(
  pair: MovePair,
  parsed: MoveFileInput,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<{ from: string; to: string; moved: 1 }> {
  const fromAbs = resolveFileTarget(ctx, pair.from, 'edit', options);
  const toAbs = resolveFileTarget(ctx, pair.to, 'edit', options);
  assertNotWorkdirRoot(ctx, fromAbs, pair.from);
  assertNotBlocked(fromAbs, pair.from, blocklist);
  assertNotBlocked(toAbs, pair.to, blocklist);
  return withPathLock(fromAbs, () =>
    withPathLock(toAbs, () => applyMove(pair, parsed, fromAbs, toAbs)),
  );
}

async function applyMove(
  pair: MovePair,
  parsed: MoveFileInput,
  fromAbs: string,
  toAbs: string,
): Promise<{ from: string; to: string; moved: 1 }> {
  const info = await lstat(fromAbs).catch(() => {
    throw new Error(`Path not found: ${pair.from}`);
  });
  if (toAbs === fromAbs || toAbs.startsWith(`${fromAbs}/`)) {
    throw new Error(`Cannot move a path into itself: ${pair.to}`);
  }
  const target = await lstat(toAbs).catch(() => undefined);
  if (target) {
    if (parsed.overwrite !== true) {
      throw new Error(`Target exists; pass overwrite: true to replace: ${pair.to}`);
    }
    if (target.isDirectory() !== info.isDirectory()) {
      throw new Error(
        `Target exists with a different kind (directory: ${target.isDirectory()}): ${pair.to}`,
      );
    }
  }
  await mkdir(path.dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
  return { from: pair.from, to: pair.to, moved: 1 };
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
    throw new Error(`Refusing to move the run workdir itself: ${target}`);
  }
}
