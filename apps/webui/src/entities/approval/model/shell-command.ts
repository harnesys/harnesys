export type ShellVerdict = 'allow' | 'ask' | 'deny';

export interface ShellSegment {
  text: string;
  verdict: ShellVerdict | null;
}

export interface ShellCommandView {
  command: string;
  segments: ShellSegment[];
}

export function shellCommandOf(input: unknown, preview?: string): ShellCommandView {
  const previewText = typeof preview === 'string' ? preview : '';
  const command =
    commandOfInput(input) ?? commandOfInput(parseJson(previewText)) ?? firstLine(previewText);
  const segments = isCommandJson(previewText) ? [] : verdictLines(previewText);
  return { command, segments };
}

export function programOfCommand(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? '';
  return first.replace(/^['"]+|['"]+$/g, '');
}

function commandOfInput(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith('{')) {
      return commandOfInput(parseJson(trimmed)) ?? trimmed;
    }
    return trimmed;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const command = (input as Record<string, unknown>).command;
  if (typeof command === 'string' && command.trim()) {
    return command.trim();
  }
  return undefined;
}

function verdictLines(preview: string): ShellSegment[] {
  const [, ...rest] = preview.split('\n');
  const segments: ShellSegment[] = [];
  for (const line of rest) {
    const cut = line.lastIndexOf('|');
    if (cut < 0) {
      continue;
    }
    const text = line.slice(0, cut).trim();
    if (!text) {
      continue;
    }
    segments.push({ text, verdict: verdictOf(line.slice(cut + 1)) });
  }
  return segments;
}

function verdictOf(token: string): ShellVerdict | null {
  const normalized = token.trim().toLowerCase();
  if (normalized.includes('deny') || normalized.includes('floor') || normalized.includes('block')) {
    return 'deny';
  }
  if (normalized.includes('allow')) {
    return 'allow';
  }
  if (normalized.includes('ask')) {
    return 'ask';
  }
  return null;
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').trim();
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function isCommandJson(text: string): boolean {
  return commandOfInput(parseJson(text)) !== undefined;
}
