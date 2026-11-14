import { trace } from '../lib/trace';

export interface SseFrame {
  event: string;
  data: string;
  id?: string;
}

export interface ReadSseOptions {
  idleTimeoutMs?: number;
}

export async function* readSse(
  response: Response,
  options?: ReadSseOptions,
): AsyncGenerator<SseFrame> {
  if (!response.body) {
    trace('sse', 'no response body');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const idleTimeoutMs = options?.idleTimeoutMs ?? 0;
  let buffer = '';
  try {
    while (true) {
      const chunk =
        idleTimeoutMs > 0 ? await withDeadline(reader.read(), idleTimeoutMs) : await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const frames = buffer.split('\n\n');
      buffer = chunk.done ? '' : (frames.pop() ?? '');
      for (const block of frames) {
        const frame = parseBlock(block);
        if (frame) {
          yield frame;
        }
      }
      if (chunk.done) {
        const last = parseBlock(buffer);
        if (last) {
          yield last;
        }
        trace('sse', 'reader done');
        return;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
}

async function withDeadline<T>(read: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sse stream stalled')), ms);
  });
  try {
    return await Promise.race([read, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function parseBlock(block: string): SseFrame | undefined {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('id:')) {
      const value = line.slice(3).trim();
      id = value || id;
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length === 0) {
    return undefined;
  }
  return { event, data: data.join('\n'), id };
}
