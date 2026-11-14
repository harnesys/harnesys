import { Controller, Ctx, Get, Param, UseGuards } from '@harnesys/brix';
import type { AddonEvent } from '@harnesys/contracts';
import { AddonEventSchema } from '@harnesys/contracts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { OrgAccessGuard } from '../guards/org-access.guard.ts';

const ADDON_EVENT_PATTERNS = ['addon.*'] as const;
const QUEUE_LIMIT = 256;
const FLUSH_MS = 250;

interface AddonEnvelope {
  name: string;
  payload: unknown;
  occurredAt: string;
}

@UseGuards(OrgAccessGuard)
@Controller('orgs/:orgId/addons/events')
export class AddonsEventsController {
  constructor(private readonly bus: EventBusPort) {}

  @Get()
  events(@Param('orgId') orgId: string, @Ctx() ctx: { request: Request }): Response {
    void ctx;
    const queue: AddonEvent[] = [];
    let writer: ((payload: string) => void) | null = null;
    let flusher: ReturnType<typeof setInterval> | undefined;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      subscription?.close();
      if (flusher !== undefined) {
        clearInterval(flusher);
        flusher = undefined;
      }
      if (keepAlive !== undefined) {
        clearInterval(keepAlive);
        keepAlive = undefined;
      }
      writer = null;
    };
    const subscription = this.bus.subscribe(orgId, ADDON_EVENT_PATTERNS, (envelope) => {
      this.enqueue(queue, envelope as AddonEnvelope);
    });
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        writer = (payload: string) => {
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            cleanup();
          }
        };
        writer('retry: 3000\n\n');
        flusher = setInterval(() => {
          while (queue.length > 0 && writer !== null) {
            const event = queue.shift();
            if (event) {
              writer(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }
          }
        }, FLUSH_MS);
        keepAlive = setInterval(() => writer?.(': keep-alive\n\n'), 15000);
      },
      cancel: cleanup,
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  private enqueue(queue: AddonEvent[], envelope: AddonEnvelope): void {
    const parsed = AddonEventSchema.safeParse(envelope.payload);
    if (parsed.success) {
      queue.push(parsed.data);
    }
    while (queue.length > QUEUE_LIMIT) {
      queue.shift();
    }
  }
}
