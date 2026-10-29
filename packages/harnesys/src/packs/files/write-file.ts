import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';
export function writeFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('write_file', {
    group: 'files',
    description: 'Write or create a text file inside a source granted Write access.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        overwrite: { type: 'boolean' },
      },
      required: ['path', 'content'],
    },
    gate: fileAccessGate('edit', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as {
        path: string;
        content: string;
        overwrite?: boolean;
      };
      const absolute = resolveFileTarget(ctx, parsed.path, 'edit', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      return withPathLock(absolute, async () => {
        const file = Bun.file(absolute);
        const exists = await file.exists();
        if (exists && parsed.overwrite === false) {
          throw new Error(`File exists and overwrite is false: ${parsed.path}`);
        }
        await mkdir(path.dirname(absolute), { recursive: true });
        await Bun.write(absolute, parsed.content);
        return { path: parsed.path, bytes: parsed.content.length, created: !exists };
      });
    },
  });
}
