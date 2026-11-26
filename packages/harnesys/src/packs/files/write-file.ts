import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGateAll, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';

interface WriteEntry {
  path: string;
  content: string;
  overwrite?: boolean;
}

interface WriteFileInput {
  path?: string;
  content?: string;
  overwrite?: boolean;
  files?: WriteEntry[];
}

interface WriteFailure {
  path: string;
  error: string;
}

export function writeFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('write_file', {
    group: 'files',
    description:
      'Write or create text files inside a source granted Write access: one path/content pair or a files batch. Existing files are replaced unless overwrite is false.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        overwrite: { type: 'boolean' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              overwrite: { type: 'boolean' },
            },
            required: ['path', 'content'],
          },
        },
      },
    },
    gate: fileAccessGateAll('edit', [(input) => writeTargets(input as WriteFileInput)]),
    async execute(input, ctx) {
      const parsed = input as WriteFileInput;
      if (parsed.files !== undefined) {
        if (parsed.path !== undefined || parsed.content !== undefined) {
          throw new Error('Provide either path/content or files, not both');
        }
        return writeBatch(parsed.files, parsed.overwrite, ctx, options, blocklist);
      }
      if (parsed.path === undefined || parsed.content === undefined) {
        throw new Error('Provide path and content, or a files array');
      }
      const outcome = await writeOne(
        { path: parsed.path, content: parsed.content, overwrite: parsed.overwrite },
        ctx,
        options,
        blocklist,
      );
      return { path: parsed.path, bytes: outcome.bytes, created: outcome.created };
    },
  });
}

function writeTargets(parsed: WriteFileInput): string[] {
  if (parsed.files !== undefined) {
    return parsed.files.map((entry) => entry.path);
  }
  return parsed.path === undefined ? [] : [parsed.path];
}

async function writeBatch(
  entries: WriteEntry[],
  overwrite: boolean | undefined,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  if (entries.length === 0) {
    throw new Error('files is empty');
  }
  const failed: WriteFailure[] = [];
  let written = 0;
  for (const entry of entries) {
    try {
      await writeOne(
        { ...entry, overwrite: entry.overwrite ?? overwrite },
        ctx,
        options,
        blocklist,
      );
      written += 1;
    } catch (error) {
      failed.push({
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { written, failed };
}

async function writeOne(
  entry: WriteEntry,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<{ bytes: number; created: boolean }> {
  const absolute = resolveFileTarget(ctx, entry.path, 'edit', options);
  const blocking = firstBlockingPattern(absolute, blocklist);
  if (blocking) {
    throw new Error(`Path is blocked (${blocking}): ${entry.path}`);
  }
  return withPathLock(absolute, async () => {
    const file = Bun.file(absolute);
    const exists = await file.exists();
    if (exists && entry.overwrite === false) {
      throw new Error(`File exists and overwrite is false: ${entry.path}`);
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await Bun.write(absolute, entry.content);
    return { bytes: entry.content.length, created: !exists };
  });
}
