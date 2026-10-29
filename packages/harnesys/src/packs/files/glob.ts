import { statSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessAllows } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { createSearchFilter } from '../../adapters/actions/path-blocklist.ts';
import { canonicalizePath, resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
export function globTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('glob', {
    group: 'files',
    description: 'Find files by glob pattern under the workdir.',
    operations: ['fs.read'],
    sideEffect: 'read',
    input: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern'],
    },
    async execute(input, ctx) {
      const parsed = input as {
        pattern: string;
      };
      const workdir = resolveWorkdirPath(ctx.cwd, '.', options.root);
      const scanDirs = existingDirs([workdir]);
      const hidden = await createSearchFilter(workdir, blocklist);
      const keep = keepFilter(ctx, workdir);
      const matches: string[] = [];
      for (const dir of scanDirs) {
        matches.push(...(await scanDir(dir, parsed.pattern, workdir, hidden, keep)));
      }
      return {
        pattern: parsed.pattern,
        matches: [...new Set(matches)].sort((a, b) => a.localeCompare(b)),
      };
    },
  });
}
function keepFilter(ctx: ToolContext, workdir: string): (canonical: string) => boolean {
  if (ctx.fileAccess) {
    return (canonical) => fileAccessAllows(ctx, canonical);
  }
  return (canonical) => {
    try {
      resolveWorkdirPath(workdir, canonical);
      return true;
    } catch {
      return false;
    }
  };
}
async function scanDir(
  dir: string,
  pattern: string,
  workdir: string,
  hidden: (absolute: string) => boolean,
  keep: (canonical: string) => boolean,
): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const match of new Bun.Glob(pattern).scan({
      cwd: dir,
      onlyFiles: true,
      dot: true,
    })) {
      const absolute = path.resolve(dir, match);
      if (hidden(absolute)) {
        continue;
      }
      const canonical = canonicalizePath(workdir, absolute);
      if (!keep(canonical)) {
        continue;
      }
      out.push(path.relative(workdir, canonical).split(path.sep).join('/'));
    }
  } catch {
    return [];
  }
  return out;
}
function existingDirs(dirs: string[]): string[] {
  return [...new Set(dirs.map((dir) => path.resolve(dir)))].filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}
