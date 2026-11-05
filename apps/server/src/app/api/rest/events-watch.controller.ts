import type { BrixContext } from '@harnesys/brix';
import { Controller, Ctx, Get, UseGuards } from '@harnesys/brix';
import { SSE_KEEP_ALIVE_MS } from '../../../const.ts';
import type { EventsWatchFrame } from '../../domain/events-watch/events-watch-frame.ts';
import { KEEP_ALIVE_FRAME, serializeFrame } from '../../domain/events-watch/events-watch-frame.ts';
import type { EventsWatchSubscription } from '../../domain/events-watch/events-watch-hub.port.ts';
import { EventsWatchHubPort } from '../../domain/events-watch/events-watch-hub.port.ts';
import { SourceWatchGatePort } from '../../domain/source/source-watch-gate.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';
import { OrgIdHeader } from '../org-id.ts';

@UseGuards(OrgAccessGuard)
@Controller()
export class EventsWatchController {
  constructor(
    private readonly hub: EventsWatchHubPort,
    private readonly sourceWatchGate: SourceWatchGatePort,
  ) {}

  @Get('events/watch')
  watch(@OrgIdHeader() orgId: string, @Ctx() ctx: BrixContext): Response {
    const fromSeq = parseCursor(ctx);
    const hub = this.hub;
    const sourceWatchGate = this.sourceWatchGate;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let subscription: EventsWatchSubscription | undefined;
    let releaseSourceWatches: (() => void) | undefined;
    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      subscription?.close();
      releaseSourceWatches?.();
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const write = (frame: EventsWatchFrame) => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(serializeFrame(frame)));
          } catch {
            cleanup();
          }
        };
        const flush = () => {
          for (const frame of subscription?.drain() ?? []) {
            write(frame);
          }
        };
        subscription = hub.subscribe(orgId, fromSeq, flush);
        releaseSourceWatches = sourceWatchGate.acquire(orgId);
        flush();
        if (closed) {
          return;
        }
        keepAlive = setInterval(() => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(KEEP_ALIVE_FRAME));
          } catch {
            cleanup();
          }
        }, SSE_KEEP_ALIVE_MS);
      },
      cancel() {
        cleanup();
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
}

function parseCursor(ctx: BrixContext): number | undefined {
  const header = ctx.req.header('Last-Event-ID')?.trim() ?? '';
  const query = new URL(ctx.req.url).searchParams.get('fromSeq')?.trim() ?? '';
  const raw = header || query;
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}
