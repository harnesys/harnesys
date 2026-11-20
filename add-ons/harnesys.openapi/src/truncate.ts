const MARKER_RESERVE = 48;

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function truncateText(text: string, maxBytes: number): string {
  const total = byteLength(text);
  if (total <= maxBytes) {
    return text;
  }
  const keep = largestFittingKeep(text, total, Math.max(1, maxBytes));
  const clipped = clipToByteLimit(text, keep);
  return `${clipped}\n[truncated: ${total} bytes total, showing first ${byteLength(clipped)} bytes]`;
}

function largestFittingKeep(text: string, total: number, maxBytes: number): number {
  let low = 1;
  let high = Math.max(1, maxBytes - MARKER_RESERVE);
  let best = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const clipped = clipToByteLimit(text, mid);
    const used = byteLength(clipped) + byteLength(markerFor(total, clipped)) + 1;
    if (used <= maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function markerFor(total: number, clipped: string): string {
  return `[truncated: ${total} bytes total, showing first ${byteLength(clipped)} bytes]`;
}

function clipToByteLimit(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  const slice = bytes.slice(0, maxBytes);
  return new TextDecoder().decode(slice);
}

export interface ResponsePayload {
  json: unknown;
  text: string | null;
}

export function responsePayload(
  rawBody: string | null,
  contentType: string | undefined,
  maxBytes: number,
): ResponsePayload {
  if (rawBody === null || rawBody.length === 0) {
    return { json: undefined, text: null };
  }
  if (isJsonContent(contentType, rawBody)) {
    const parsed = safeParse(rawBody);
    if (parsed.ok && byteLength(rawBody) <= maxBytes) {
      return { json: parsed.value, text: null };
    }
    if (parsed.ok && byteLength(JSON.stringify(parsed.value)) <= maxBytes) {
      return { json: parsed.value, text: null };
    }
  }
  return { json: undefined, text: truncateText(rawBody, maxBytes) };
}

function isJsonContent(contentType: string | undefined, rawBody: string): boolean {
  const header = (contentType ?? '').toLowerCase();
  if (header.includes('json')) {
    return true;
  }
  const head = rawBody.slice(0, 1);
  return head === '{' || head === '[';
}

function safeParse(text: string): { ok: boolean; value?: unknown } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
