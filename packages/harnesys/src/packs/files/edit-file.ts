import { createTwoFilesPatch } from 'diff';
import { DEFAULT_PATH_BLOCKLIST } from '../../adapters/actions/constants.ts';
import { fileAccessGate, resolveFileTarget } from '../../adapters/actions/file-guard.ts';
import type { FilesOptions } from '../../adapters/actions/files-options.ts';
import { firstBlockingPattern } from '../../adapters/actions/path-blocklist.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { withPathLock } from './path-lock.ts';

interface EditFileInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface EditFileResult {
  path: string;
  replacements: number;
  diff: string;
}

interface ReplaceRegion {
  start: number;
  end: number;
}

interface WhitespaceMap {
  text: string;
  offsets: Array<number | undefined>;
}

export function editFileTool(options: FilesOptions = {}): ToolDefinition {
  const blocklist = options.blocklist ?? DEFAULT_PATH_BLOCKLIST;
  return tool('edit_file', {
    group: 'files',
    description: 'Replace text in a source granted Write access. Returns a unified diff.',
    operations: ['fs.write'],
    sideEffect: 'write',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    gate: fileAccessGate('edit', (input) => (input as { path?: string }).path),
    async execute(input, ctx) {
      const parsed = input as EditFileInput;
      const absolute = resolveFileTarget(ctx, parsed.path, 'edit', options);
      const blocking = firstBlockingPattern(absolute, blocklist);
      if (blocking) {
        throw new Error(`Path is blocked (${blocking}): ${parsed.path}`);
      }
      return withPathLock(absolute, () => applyEdit(absolute, parsed));
    },
  });
}
async function applyEdit(absolute: string, parsed: EditFileInput): Promise<EditFileResult> {
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
function notFoundError(previous: string, oldString: string, path: string): string {
  const closest = closestLine(previous, oldString);
  let hint = 're-read the file: the text may have changed or differ from your memory';
  if (closest !== null) {
    hint += `; the closest existing line is ${closest.line}: ${closest.text}`;
  }
  return `old_string not found in ${path}; ${hint}`;
}
function closestLine(previous: string, oldString: string): { line: number; text: string } | null {
  const needle = oldString.split('\n')[0]?.trim();
  if (!needle) {
    return null;
  }
  const lines = previous.split('\n');
  let best: { line: number; text: string } | null = null;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const score = bigramSimilarity(lines[i] ?? '', needle);
    if (score > bestScore) {
      bestScore = score;
      best = { line: i + 1, text: lines[i]?.trimStart().slice(0, 120) ?? '' };
    }
  }
  return best;
}
function bigramSimilarity(haystackLine: string, needle: string): number {
  const a = trimmedBigrams(haystackLine);
  const b = trimmedBigrams(needle);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const [text, count] of b) {
    const seen = a.get(text) ?? 0;
    shared += Math.min(seen, count);
  }
  return (2 * shared) / (a.size + b.size);
}
function trimmedBigrams(line: string): Map<string, number> {
  const normalized = line.trim();
  const counts = new Map<string, number>();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const gram = normalized.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    count += 1;
    from = index + needle.length;
  }
  return count;
}
function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
interface MappedLine {
  chars: string[];
  offsets: Array<number | undefined>;
}
function mapLine(line: string, lineStart: number, out: MappedLine): void {
  let offset = lineStart;
  let emitted = false;
  let pendingSpace: number | undefined;
  for (const ch of line) {
    if (ch === ' ' || ch === '\t') {
      if (emitted && pendingSpace === undefined) {
        pendingSpace = offset;
      }
    } else {
      if (pendingSpace !== undefined) {
        out.chars.push(' ');
        out.offsets.push(pendingSpace);
        pendingSpace = undefined;
      }
      out.chars.push(ch);
      out.offsets.push(offset);
      emitted = true;
    }
    offset += ch.length;
  }
}
function buildWhitespaceMap(text: string): WhitespaceMap {
  const chars: string[] = [];
  const offsets: Array<number | undefined> = [];
  const lines = text.split('\n');
  let lineStart = 0;
  for (let i = 0; i < lines.length; i += 1) {
    mapLine(lines[i] ?? '', lineStart, { chars, offsets });
    if (i < lines.length - 1) {
      chars.push('\n');
      offsets.push(undefined);
    }
    lineStart += (lines[i]?.length ?? 0) + 1;
  }
  return { text: chars.join(''), offsets };
}
function applyWhitespaceTolerantEdit(
  previous: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): { next: string; count: number } | null {
  const haystack = buildWhitespaceMap(previous);
  const needle = buildWhitespaceMap(oldString).text;
  if (needle.length === 0) {
    return null;
  }
  const multiLine = needle.includes('\n');
  const regions: ReplaceRegion[] = [];
  let from = 0;
  while (from <= haystack.text.length) {
    const index = haystack.text.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    regions.push(toOriginalRegion(previous, haystack, index, needle.length, multiLine));
    from = index + needle.length;
  }
  if (regions.length === 0) {
    return null;
  }
  if (regions.length > 1 && !replaceAll) {
    throw new Error(
      `old_string (ignoring indentation) matched ${regions.length} times; set replace_all or add surrounding lines`,
    );
  }
  let next = previous;
  for (const region of regions.reverse()) {
    next = next.slice(0, region.start) + newString + next.slice(region.end);
  }
  return { next, count: regions.length };
}
function toOriginalRegion(
  previous: string,
  map: WhitespaceMap,
  index: number,
  length: number,
  multiLine: boolean,
): ReplaceRegion {
  let first = index;
  let firstOffset = map.offsets[first];
  while (firstOffset === undefined) {
    first += 1;
    firstOffset = map.offsets[first];
  }
  let last = index + length - 1;
  let lastOffset = map.offsets[last];
  while (lastOffset === undefined) {
    last -= 1;
    lastOffset = map.offsets[last];
  }
  const start = firstOffset;
  const end = lastOffset + 1;
  if (!multiLine) {
    return { start, end };
  }
  return {
    start: previous.lastIndexOf('\n', start - 1) + 1,
    end: previous.indexOf('\n', end) === -1 ? previous.length : previous.indexOf('\n', end),
  };
}
