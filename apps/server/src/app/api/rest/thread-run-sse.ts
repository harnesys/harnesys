import type { RunLifecycleStore, SessionEvent } from 'harnesys';
import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';

function isRunEndFrame(event: SessionEvent): boolean {
  return (
    event.type === 'done' ||
    event.type === 'error' ||
    event.type === 'ask' ||
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  );
}

function writeSse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: string,
  id?: string,
): void {
  try {
    const idLine = id !== undefined ? `id: ${id}\n` : '';
    controller.enqueue(encoder.encode(`${idLine}event: ${event}\ndata: ${data}\n\n`));
  } catch {
    // stream already closed
  }
}

async function pumpRunEvents(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  runId: string,
  events: AsyncIterable<SessionEvent>,
  lifecycle: RunLifecycleStore,
): Promise<void> {
  for await (const ev of events) {
    writeSse(controller, encoder, ev.type, JSON.stringify(ev), String(ev.seq ?? 0));
    if (!isRunEndFrame(ev)) {
      continue;
    }
    const rec = await lifecycle.get(runId);
    if (rec?.status !== 'running') {
      break;
    }
  }
  const rec = await lifecycle.get(runId);
  if (rec) {
    writeSse(controller, encoder, 'run-paused', JSON.stringify({ runId, status: rec.status }));
  }
}

export function streamRunSse(
  runId: string,
  events: AsyncIterable<SessionEvent>,
  lifecycle: RunLifecycleStore,
): Response {
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':\n\n'));
        } catch {
          // stream already closed
        }
      }, SSE_KEEP_ALIVE_MS);
      void (async () => {
        try {
          await pumpRunEvents(controller, encoder, runId, events, lifecycle);
        } finally {
          if (keepAlive) {
            clearInterval(keepAlive);
          }
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      })();
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
