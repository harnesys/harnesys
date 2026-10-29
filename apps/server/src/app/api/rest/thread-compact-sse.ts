import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';
import type { CompactThreadResult } from '../../domain/thread/local-executor.port.ts';

function writeFrame(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: string,
  data: string,
): void {
  try {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
  } catch {
    // stream already closed
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Compact failed';
}

export function streamCompactSse(run: () => Promise<CompactThreadResult>): Response {
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
          const result = await run();
          writeFrame(controller, encoder, 'compact.result', JSON.stringify(result));
        } catch (error) {
          writeFrame(
            controller,
            encoder,
            'error',
            JSON.stringify({ message: errorMessage(error) }),
          );
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
