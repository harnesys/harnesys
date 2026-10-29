interface ScanCursor {
  text: string;
  index: number;
}

type Push = (value: string) => void;

export function segmentCommand(command: string): string[] {
  const cursor: ScanCursor = { text: command, index: 0 };
  const segments: string[] = [];
  let current = '';
  const push = (): void => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      segments.push(trimmed);
    }
    current = '';
  };
  while (cursor.index < cursor.text.length) {
    const quoted = takeQuoted(cursor);
    if (quoted !== null) {
      current += quoted;
      continue;
    }
    const escaped = takeEscaped(cursor);
    if (escaped !== null) {
      current += escaped;
      continue;
    }
    if (takeOperator(cursor)) {
      push();
      continue;
    }
    current += peek(cursor);
    cursor.index += 1;
  }
  push();
  return segments;
}

export function extractNested(command: string): string[] {
  const found: string[] = [];
  const push: Push = (value) => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !found.includes(trimmed)) {
      found.push(trimmed);
    }
  };
  collectSubstitutions(command, push);
  collectBackticks(command, push);
  collectFlagPayloads(command, push);
  return found;
}

export function isTainted(segment: string): boolean {
  if (segment.includes('$(') || segment.includes('`') || segment.includes('<(')) {
    return true;
  }
  if (/\beval\b/.test(segment)) {
    return true;
  }
  if (/\b(?:sh|bash)\s+-c\b/.test(segment)) {
    return true;
  }
  if (/\bxargs\b/.test(segment)) {
    return true;
  }
  return false;
}

export function programOf(segment: string): string {
  const token = segment.trim().split(/\s+/)[0] ?? '';
  return token.replace(/^['"]+|['"]+$/g, '');
}

function peek(cursor: ScanCursor): string {
  return cursor.text[cursor.index] ?? '';
}

function takeQuoted(cursor: ScanCursor): string | null {
  const quote = peek(cursor);
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  let out = quote;
  cursor.index += 1;
  while (cursor.index < cursor.text.length) {
    const inner = peek(cursor);
    if (inner === quote) {
      cursor.index += 1;
      return out + inner;
    }
    const escaped = quote === '"' ? takeEscaped(cursor) : null;
    if (escaped !== null) {
      out += escaped;
      continue;
    }
    out += inner;
    cursor.index += 1;
  }
  return out;
}

function takeEscaped(cursor: ScanCursor): string | null {
  if (peek(cursor) !== '\\' || cursor.index + 1 >= cursor.text.length) {
    return null;
  }
  const out = `\\${cursor.text[cursor.index + 1] ?? ''}`;
  cursor.index += 2;
  return out;
}

function takeOperator(cursor: ScanCursor): boolean {
  const char = peek(cursor);
  const following = cursor.text[cursor.index + 1] ?? '';
  if (isDoubleOperator(char, following)) {
    cursor.index += 2;
    return true;
  }
  if (char === ';' || char === '|' || char === '&') {
    cursor.index += 1;
    return true;
  }
  return false;
}

function isDoubleOperator(char: string, following: string): boolean {
  return (char === '&' && following === '&') || (char === '|' && following === '|');
}

function collectSubstitutions(command: string, push: Push): void {
  const cursor: ScanCursor = { text: command, index: 0 };
  while (cursor.index < cursor.text.length) {
    if (takeQuoted(cursor) !== null || takeEscaped(cursor) !== null) {
      continue;
    }
    if (peek(cursor) === '$' && (cursor.text[cursor.index + 1] ?? '') === '(') {
      const end = findClosingParen(command, cursor.index + 2);
      if (end === null) {
        return;
      }
      push(command.slice(cursor.index + 2, end));
      cursor.index = end + 1;
      continue;
    }
    cursor.index += 1;
  }
}

function findClosingParen(command: string, start: number): number | null {
  const cursor: ScanCursor = { text: command, index: start };
  let depth = 1;
  while (cursor.index < cursor.text.length) {
    if (takeQuoted(cursor) !== null || takeEscaped(cursor) !== null) {
      continue;
    }
    depth += parenDelta(peek(cursor));
    if (depth === 0) {
      return cursor.index;
    }
    cursor.index += 1;
  }
  return null;
}

function parenDelta(char: string): number {
  if (char === '(') {
    return 1;
  }
  if (char === ')') {
    return -1;
  }
  return 0;
}

function collectBackticks(command: string, push: Push): void {
  const cursor: ScanCursor = { text: command, index: 0 };
  while (cursor.index < cursor.text.length) {
    if (takeQuoted(cursor) !== null || takeEscaped(cursor) !== null) {
      continue;
    }
    if (peek(cursor) !== '`') {
      cursor.index += 1;
      continue;
    }
    const end = findClosingBacktick(command, cursor.index + 1);
    if (end === null) {
      return;
    }
    push(command.slice(cursor.index + 1, end));
    cursor.index = end + 1;
  }
}

function findClosingBacktick(command: string, start: number): number | null {
  const cursor: ScanCursor = { text: command, index: start };
  while (cursor.index < cursor.text.length) {
    if (takeEscaped(cursor) !== null) {
      continue;
    }
    if (peek(cursor) === '`') {
      return cursor.index;
    }
    cursor.index += 1;
  }
  return null;
}

function collectFlagPayloads(command: string, push: Push): void {
  const shellFlag = /(?:^|[\s;&|(`])(?:sh|bash)\s+-c\s+("[^"]*"|'[^']*'|\S+)/g;
  const evalFlag = /\beval\s+("[^"]*"|'[^']*'|\S+)/g;
  for (const pattern of [shellFlag, evalFlag]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(command);
    while (match !== null) {
      push(stripQuotes(match[1] ?? ''));
      match = pattern.exec(command);
    }
  }
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0] ?? '';
    const last = value[value.length - 1] ?? '';
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}
