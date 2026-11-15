export interface BlockInput {
  type: string;
  [key: string]: unknown;
}

interface RichText {
  type?: string;
  text?: { content?: string };
  plain_text?: string;
}

interface BlockPayload {
  rich_text?: RichText[];
}

type PendingKind = 'para' | 'todo' | 'checked' | 'bullet';

interface PendingLine {
  indent: number;
  text: string;
  kind: PendingKind;
}

interface FenceState {
  open: boolean;
  lang: string;
  lines: string[];
}

interface ConversionState {
  blocks: BlockInput[];
  pending: PendingLine[];
  fence: FenceState;
}

const FENCE_START = /^```(\S*)\s*$/;
const DIVIDER = /^(---|\*\*\*|___)\s*$/;
const QUOTE = /^> ?(.*)$/;
const TODO = /^- \[( |x|X)\] (.*)$/;
const BULLET = /^[-*] (.*)$/;
const NUMBERED = /^\d+[.)] (.*)$/;

const CODE_LANGS = new Set([
  'abap',
  'arduino',
  'bash',
  'basic',
  'c',
  'clojure',
  'coffeescript',
  'c++',
  'c#',
  'css',
  'dart',
  'diff',
  'docker',
  'elixir',
  'elm',
  'erlang',
  'flow',
  'fortran',
  'f#',
  'gherkin',
  'glsl',
  'go',
  'graphql',
  'groovy',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lisp',
  'livescript',
  'lua',
  'makefile',
  'markdown',
  'mermaid',
  'nix',
  'objective-c',
  'ocaml',
  'pascal',
  'perl',
  'php',
  'plain text',
  'powershell',
  'prolog',
  'protobuf',
  'puppet',
  'python',
  'r',
  'ruby',
  'rust',
  'sass',
  'scala',
  'scheme',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'vb.net',
  'verilog',
  'vhdl',
  'visual basic',
  'webassembly',
  'xml',
  'yaml',
]);

const CODE_LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'c++',
  'c#': 'c#',
  golang: 'go',
};

export function codeLanguage(lang: string | undefined): string {
  if (lang === undefined || lang === null || lang.trim() === '') {
    return 'plain text';
  }
  const normalized = lang.trim().toLowerCase();
  const mapped = CODE_LANG_ALIASES[normalized] ?? normalized;
  return CODE_LANGS.has(mapped) ? mapped : 'plain text';
}

function rich(content: string): BlockPayload {
  return { rich_text: [{ type: 'text', text: { content } }] };
}

function todoPrefix(line: string): { checked: boolean; rest: string } | null {
  const match = TODO.exec(line);
  if (match === null) {
    return null;
  }
  return { checked: match[1] !== ' ', rest: match[2] ?? '' };
}

function listPrefix(line: string): string | null {
  const bullet = BULLET.exec(line);
  if (bullet !== null) {
    return bullet[1] ?? '';
  }
  const numbered = NUMBERED.exec(line);
  return numbered === null ? null : (numbered[1] ?? '');
}

function headingLevel(line: string): { level: 1 | 2 | 3; rest: string } | null {
  for (const level of [1, 2, 3] as const) {
    const hashes = '#'.repeat(level);
    if (line.startsWith(`${hashes} `)) {
      return { level, rest: line.slice(hashes.length + 1).trim() };
    }
  }
  return null;
}

function blockForLine(kind: PendingKind, text: string): BlockInput {
  const payload = rich(text);
  switch (kind) {
    case 'todo':
      return { type: 'to_do', to_do: { ...payload, checked: false } };
    case 'checked':
      return { type: 'to_do', to_do: { ...payload, checked: true } };
    case 'bullet':
      return { type: 'bulleted_list_item', bulleted_list_item: payload };
    default:
      return { type: 'paragraph', paragraph: payload };
  }
}

function pendingToBlocks(pending: PendingLine[]): BlockInput[] {
  const blocks: BlockInput[] = [];
  let index = 0;
  while (index < pending.length) {
    const line = pending[index];
    if (line === undefined) {
      break;
    }
    const block = blockForLine(line.kind, line.text);
    const nested: BlockInput[] = [];
    let cursor = index + 1;
    while (cursor < pending.length) {
      const next = pending[cursor];
      if (next === undefined || next.indent <= line.indent) {
        break;
      }
      nested.push(blockForLine(next.kind, next.text));
      cursor += 1;
    }
    if (nested.length > 0) {
      (block as Record<string, unknown>).children = nested;
    }
    blocks.push(block);
    index = cursor > index + 1 ? cursor : index + 1;
  }
  return blocks;
}

function flushPending(pending: PendingLine[], blocks: BlockInput[]): void {
  if (pending.length > 0) {
    blocks.push(...pendingToBlocks(pending));
    pending.length = 0;
  }
}

function indentOf(line: string): number {
  const match = /^[ \t]*/.exec(line);
  const whitespace = match?.[0] ?? '';
  return whitespace.replace(/\t/g, '  ').length;
}

function codeBlock(lang: string, lines: readonly string[]): BlockInput {
  return {
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: lines.join('\n') } }],
      language: codeLanguage(lang),
    },
  };
}

function consumeFenceLine(rawLine: string, state: ConversionState): void {
  if (rawLine.trimEnd() === '```') {
    state.blocks.push(codeBlock(state.fence.lang, state.fence.lines));
    state.fence.open = false;
    state.fence.lang = '';
    state.fence.lines = [];
    return;
  }
  state.fence.lines.push(rawLine);
}

function consumeLine(rawLine: string, state: ConversionState): void {
  const line = rawLine.trimEnd();
  const trimmed = line.trim();
  if (trimmed === '') {
    return;
  }
  const fence = FENCE_START.exec(trimmed);
  if (fence !== null) {
    flushPending(state.pending, state.blocks);
    state.fence.open = true;
    state.fence.lang = fence[1] ?? '';
    return;
  }
  if (DIVIDER.test(trimmed)) {
    flushPending(state.pending, state.blocks);
    state.blocks.push({ type: 'divider', divider: {} });
    return;
  }
  const quote = QUOTE.exec(trimmed);
  if (quote !== null) {
    flushPending(state.pending, state.blocks);
    state.blocks.push({ type: 'quote', quote: rich(quote[1] ?? '') });
    return;
  }
  const heading = headingLevel(trimmed);
  if (heading !== null) {
    flushPending(state.pending, state.blocks);
    const key = `heading_${heading.level}`;
    state.blocks.push({ type: key, [key]: rich(heading.rest) });
    return;
  }
  const todo = todoPrefix(trimmed);
  if (todo !== null) {
    state.pending.push({
      indent: indentOf(rawLine),
      text: todo.rest,
      kind: todo.checked ? 'checked' : 'todo',
    });
    return;
  }
  const list = listPrefix(trimmed);
  if (list !== null) {
    state.pending.push({ indent: indentOf(rawLine), text: list, kind: 'bullet' });
    return;
  }
  state.pending.push({ indent: indentOf(rawLine), text: trimmed, kind: 'para' });
}

export function markdownToBlocks(markdown: string): BlockInput[] {
  const state: ConversionState = {
    blocks: [],
    pending: [],
    fence: { open: false, lang: '', lines: [] },
  };
  for (const rawLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (state.fence.open) {
      consumeFenceLine(rawLine, state);
    } else {
      consumeLine(rawLine, state);
    }
  }
  if (state.fence.open) {
    state.blocks.push(codeBlock(state.fence.lang, state.fence.lines));
  }
  flushPending(state.pending, state.blocks);
  return state.blocks;
}
