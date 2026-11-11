export const DRAFT_FLUSH_CHARS = 200;

export interface DraftAccumulator {
  text: string;
  lastSeq: number;
}

export function emptyDraft(): DraftAccumulator {
  return { text: '', lastSeq: 0 };
}

export function applyDelta(
  draft: DraftAccumulator,
  event: { text: string; seq?: number },
): DraftAccumulator {
  const seq = typeof event.seq === 'number' ? event.seq : 0;
  if (seq > 0 && seq <= draft.lastSeq) {
    return draft;
  }
  return {
    text: draft.text + event.text,
    lastSeq: seq > draft.lastSeq ? seq : draft.lastSeq,
  };
}

export function renderDraft(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

export function optionIndexFrom(text: string, optionCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const index = Number(trimmed);
  return index >= 1 && index <= optionCount ? index - 1 : null;
}

export function optionByLabel(text: string, options: readonly string[]): number | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === '') {
    return null;
  }
  const index = options.findIndex((option) => option.toLowerCase() === normalized);
  return index >= 0 ? index : null;
}
