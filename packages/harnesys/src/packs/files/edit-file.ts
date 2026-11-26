import { createTwoFilesPatch } from 'diff';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGateAll, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import {
  applyWhitespaceTolerantEdit,
  countOccurrences,
  notFoundError,
  toLf,
} from './edit-match.ts';
import { withPathLock } from './path-lock.ts';

interface EditEntry {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface EditFileInput {
  path?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  edits?: EditEntry[];
}

interface EditFailure {
  path: string;
  error: string;
}

interface EditFileResult {
  path: string;
  replacements: number;
  diff: string;
}

export function editFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('edit_file', {
    group: 'files',
    description:
      'Replace text in files granted Write access: one path/old_string/new_string or an edits batch. ' +
      'Single edits return a unified diff; batches report per-file replacement counts.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              old_string: { type: 'string' },
              new_string: { type: 'string' },
              replace_all: { type: 'boolean' },
            },
            required: ['path', 'old_string', 'new_string'],
          },
        },
      },
    },
    gate: fileAccessGateAll('edit', [(input) => editTargets(input as EditFileInput)]),
    async execute(input, ctx) {
      const parsed = input as EditFileInput;
      if (parsed.edits !== undefined) {
        if (
          parsed.path !== undefined ||
          parsed.old_string !== undefined ||
          parsed.new_string !== undefined
        ) {
          throw new Error('Provide either path/old_string/new_string or edits, not both');
        }
        return editBatch(parsed.edits, parsed.replace_all, ctx, options, blocklist);
      }
      if (parsed.path === undefined || parsed.old_string === undefined) {
        throw new Error('Provide path and old_string (with new_string), or an edits array');
      }
      const entry: EditEntry = {
        path: parsed.path,
        old_string: parsed.old_string,
        new_string: parsed.new_string ?? '',
        replace_all: parsed.replace_all,
      };
      return editOne(entry, ctx, options, blocklist);
    },
  });
}

function editTargets(parsed: EditFileInput): string[] {
  if (parsed.edits !== undefined) {
    return parsed.edits.map((entry) => entry.path);
  }
  return parsed.path === undefined ? [] : [parsed.path];
}

async function editBatch(
  entries: EditEntry[],
  replaceAll: boolean | undefined,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<unknown> {
  if (entries.length === 0) {
    throw new Error('edits is empty');
  }
  const results: Array<{ path: string; replacements: number }> = [];
  const failed: EditFailure[] = [];
  for (const entry of entries) {
    try {
      const out = await editOne(
        { ...entry, replace_all: entry.replace_all ?? replaceAll },
        ctx,
        options,
        blocklist,
      );
      results.push({ path: out.path, replacements: out.replacements });
    } catch (error) {
      failed.push({
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { applied: results.length, results, failed };
}

async function editOne(
  entry: EditEntry,
  ctx: ToolContext,
  options: FilesOptions,
  blocklist: readonly string[],
): Promise<EditFileResult> {
  const absolute = resolveFileTarget(ctx, entry.path, 'edit', options);
  const blocking = firstBlockingPattern(absolute, blocklist);
  if (blocking) {
    throw new Error(`Path is blocked (${blocking}): ${entry.path}`);
  }
  return withPathLock(absolute, () => applyEdit(absolute, entry));
}
async function applyEdit(absolute: string, parsed: EditEntry): Promise<EditFileResult> {
  const file = Bun.file(absolute);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${parsed.path}`);
  }
  const raw = await file.text();
  const usesCrlf = raw.includes('\r\n');
  const previous = usesCrlf ? raw.replace(/\r\n/g, '\n') : raw;
  const oldString = toLf(parsed.old_string);
  const newString = toLf(parsed.new_string);
  const exactCount = countOccurrences(previous, oldString);
  let next: string;
  let replacements: number;
  if (exactCount > 0) {
    if (exactCount > 1 && !parsed.replace_all) {
      throw new Error(`old_string matched ${exactCount} times; set replace_all or narrow context`);
    }
    next = parsed.replace_all
      ? previous.split(oldString).join(newString)
      : previous.replace(oldString, newString);
    replacements = parsed.replace_all ? exactCount : 1;
  } else {
    const fallback = applyWhitespaceTolerantEdit(
      previous,
      oldString,
      newString,
      Boolean(parsed.replace_all),
    );
    if (fallback === null) {
      throw new Error(notFoundError(previous, oldString, parsed.path));
    }
    next = fallback.next;
    replacements = fallback.count;
  }
  await Bun.write(absolute, usesCrlf ? next.replace(/\n/g, '\r\n') : next);
  return {
    path: parsed.path,
    replacements,
    diff: createTwoFilesPatch(parsed.path, parsed.path, previous, next, '', ''),
  };
}
