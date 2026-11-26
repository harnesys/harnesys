interface ReplaceRegion {
  start: number;
  end: number;
}

interface WhitespaceMap {
  text: string;
  offsets: Array<number | undefined>;
}

interface MappedLine {
  chars: string[];
  offsets: Array<number | undefined>;
}

export function countOccurrences(haystack: string, needle: string): number {
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

export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function notFoundError(previous: string, oldString: string, path: string): string {
  const closest = closestLine(previous, oldString);
  let hint = 're-read the file: the text may have changed or differ from your memory';
  if (closest !== null) {
    hint += `; the closest existing line is ${closest.line}: ${closest.text}`;
  }
  return `old_string not found in ${path}; ${hint}`;
}

export function applyWhitespaceTolerantEdit(
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
