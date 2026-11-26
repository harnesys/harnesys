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

interface MoveFileInput {
  from: string;
  to: string;
  overwrite?: boolean;
}

export function moveFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('move_file', {
    group: 'files',
    description:
      'Move or rename a file inside a source granted Write access. Creates the target parent directory.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        overwrite: { type: 'boolean' },
      },
      required: ['from', 'to'],
    },
    gate: fileAccessGateAll('edit', [
      (input) => (input as { from?: string }).from,
      (input) => (input as { to?: string }).to,
    ]),
    async execute(input, ctx) {
      const parsed = input as MoveFileInput;
      const fromAbs = resolveFileTarget(ctx, parsed.from, 'edit', options);
      const toAbs = resolveFileTarget(ctx, parsed.to, 'edit', options);
      assertNotWorkdirRoot(ctx, fromAbs, parsed.from);
      assertNotBlocked(fromAbs, parsed.from, blocklist);
      assertNotBlocked(toAbs, parsed.to, blocklist);
      return withPathLock(fromAbs, () =>
        withPathLock(toAbs, () => applyMove(parsed, fromAbs, toAbs)),
      );
    },
  });
}

async function applyMove(
  parsed: MoveFileInput,
  fromAbs: string,
  toAbs: string,
): Promise<{ from: string; to: string; moved: 1 }> {
  const info = await lstat(fromAbs).catch(() => {
    throw new Error(`Path not found: ${parsed.from}`);
  });
  if (toAbs === fromAbs || toAbs.startsWith(`${fromAbs}/`)) {
    throw new Error(`Cannot move a path into itself: ${parsed.to}`);
  }
  const target = await lstat(toAbs).catch(() => undefined);
  if (target) {
    if (parsed.overwrite === false) {
      throw new Error(`Target exists and overwrite is false: ${parsed.to}`);
    }
    if (target.isDirectory() !== info.isDirectory()) {
      throw new Error(
        `Target exists with a different kind (directory: ${target.isDirectory()}): ${parsed.to}`,
      );
    }
  }
  await mkdir(path.dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
  return { from: parsed.from, to: parsed.to, moved: 1 };
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
