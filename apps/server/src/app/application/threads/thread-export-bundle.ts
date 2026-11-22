import type { ThreadMember, ThreadParticipant } from '@harnesys/contracts';
import { strToU8, Zip, ZipDeflate } from 'fflate';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type {
  ThreadExportEvent,
  ThreadExportPlan,
  ThreadExportRun,
  ThreadExportSnapshot,
} from '../../domain/thread/thread-export-reader.port.ts';

const FORMAT = 'harnesys.thread-dump';
const FORMAT_VERSION = 1;
const ARCHIVE_LEVEL = 6;
const SOURCE_CHUNK_BYTES = 1 << 19;
const EVENT_BATCH_BYTES = 1 << 19;
const QUEUE_HIGH_WATER = 32;

export interface ThreadExportSource {
  name: string;
  bytes: () => Promise<Uint8Array>;
}

export interface ThreadExportBundleInput {
  orgId: string;
  thread: ThreadRecord;
  members: ThreadMember[];
  participants: ThreadParticipant[];
  attachments: AttachmentRecord[];
  events: ThreadExportEvent[];
  runs: ThreadExportRun[];
  snapshots: ThreadExportSnapshot[];
  plan: ThreadExportPlan | null;
  rawRequests: ThreadExportSource[];
  toolOutputs: ThreadExportSource[];
  exportedAt: string;
}

export interface ThreadExportBundle {
  fileName: string;
  stream: ReadableStream<Uint8Array>;
}

interface ThreadExportStaticFile {
  name: string;
  bytes: Uint8Array;
}

export function createThreadExportBundle(input: ThreadExportBundleInput): ThreadExportBundle {
  const errorEvents = input.events.filter(
    (event) => event.type === 'error' || event.type === 'run.failed',
  );
  const compactions = input.events.filter((event) => event.type === 'compaction');
  const staticFiles: ThreadExportStaticFile[] = [
    {
      name: 'thread.json',
      bytes: jsonBytes({
        thread: input.thread,
        members: input.members,
        participants: input.participants,
        lastError: input.thread.metadata.lastError ?? null,
      }),
    },
    {
      name: 'errors.json',
      bytes: jsonBytes({
        lastError: input.thread.metadata.lastError ?? null,
        events: errorEvents.map(eventLine),
      }),
    },
    { name: 'compactions.json', bytes: jsonBytes({ events: compactions.map(eventLine) }) },
    { name: 'runs.json', bytes: jsonBytes({ runs: input.runs }) },
    {
      name: 'snapshots.json',
      bytes: jsonBytes({
        snapshots: input.snapshots.map((snapshot) => ({
          ...snapshot,
          snapshot: parseJson(snapshot.snapshot) ?? snapshot.snapshot,
        })),
      }),
    },
    { name: 'plan.json', bytes: jsonBytes(planPayload(input.plan)) },
    { name: 'attachments.json', bytes: jsonBytes({ attachments: input.attachments }) },
  ];
  const queue = new ByteQueue(QUEUE_HIGH_WATER);
  const emittedRaw: string[] = [];
  const emittedTool: string[] = [];
  const missing: string[] = [];
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      queue.fail(err);
      return;
    }
    if (chunk) {
      queue.push(chunk);
    }
    if (final) {
      queue.close();
    }
  });
  let cancelled = false;
  const pushSync = (name: string, bytes: Uint8Array): void => {
    const file = new ZipDeflate(name, { level: ARCHIVE_LEVEL });
    zip.add(file);
    file.push(bytes);
    file.push(new Uint8Array(0), true);
  };
  const pushEvents = async (name: string, events: ThreadExportEvent[]): Promise<void> => {
    const file = new ZipDeflate(name, { level: ARCHIVE_LEVEL });
    zip.add(file);
    const lines: string[] = [];
    let batchBytes = 0;
    const flush = (): void => {
      if (lines.length === 0) {
        return;
      }
      file.push(strToU8(`${lines.join('\n')}\n`));
      lines.length = 0;
      batchBytes = 0;
    };
    for (const event of events) {
      const line = JSON.stringify(eventLine(event));
      lines.push(line);
      batchBytes += line.length;
      if (batchBytes >= EVENT_BATCH_BYTES) {
        await queue.waitBelow();
        flush();
        await yieldToLoop();
      }
    }
    await queue.waitBelow();
    flush();
    file.push(new Uint8Array(0), true);
  };
  const pushSource = async (
    name: string,
    source: ThreadExportSource,
    emitted: string[],
  ): Promise<void> => {
    let bytes: Uint8Array;
    try {
      bytes = await source.bytes();
    } catch {
      missing.push(name);
      return;
    }
    await pushBytes(name, bytes);
    emitted.push(name);
  };
  const pushBytes = async (name: string, bytes: Uint8Array): Promise<void> => {
    const file = new ZipDeflate(name, { level: ARCHIVE_LEVEL });
    zip.add(file);
    for (let offset = 0; offset < bytes.length; offset += SOURCE_CHUNK_BYTES) {
      await queue.waitBelow();
      file.push(bytes.subarray(offset, Math.min(offset + SOURCE_CHUNK_BYTES, bytes.length)));
      await yieldToLoop();
    }
    file.push(new Uint8Array(0), true);
  };
  const buildManifest = (): Uint8Array =>
    jsonBytes({
      format: FORMAT,
      version: FORMAT_VERSION,
      exportedAt: input.exportedAt,
      orgId: input.orgId,
      threadId: input.thread.id,
      threadTitle: input.thread.title,
      threadKind: input.thread.kind,
      counts: {
        events: input.events.length,
        errors: errorEvents.length,
        compactions: compactions.length,
        runs: input.runs.length,
        snapshots: input.snapshots.length,
        rawModelRequests: emittedRaw.length,
        toolOutputs: emittedTool.length,
        attachments: input.attachments.length,
        members: input.members.length,
        participants: input.participants.length,
        missing: missing.length,
      },
      files: [
        'manifest.json',
        'events.jsonl',
        ...staticFiles.map((file) => file.name),
        ...emittedRaw,
        ...emittedTool,
      ].sort(),
      missing: missing.sort(),
    });
  const run = async (): Promise<void> => {
    for (const file of staticFiles) {
      pushSync(file.name, file.bytes);
    }
    await pushEvents('events.jsonl', input.events);
    for (const source of input.rawRequests) {
      await pushSource(`raw-model-requests/${source.name}`, source, emittedRaw);
    }
    for (const source of input.toolOutputs) {
      await pushSource(`tool-outputs/${source.name}`, source, emittedTool);
    }
    pushSync('manifest.json', buildManifest());
    zip.end();
  };
  void run().catch((error: unknown) => {
    if (!cancelled) {
      queue.fail(error);
    }
  });
  return {
    fileName: `harnesys-thread-${input.thread.id}-${stampOf(input.exportedAt)}.zip`,
    stream: new ReadableStream<Uint8Array>({
      pull(controller) {
        return queue.read().then((chunk) => {
          if (chunk === null) {
            controller.close();
          } else {
            controller.enqueue(chunk);
          }
        });
      },
      cancel() {
        cancelled = true;
        zip.terminate();
        queue.fail(new Error('thread export cancelled'));
      },
    }),
  };
}

function eventLine(event: ThreadExportEvent): Record<string, unknown> {
  const metadata = event.metadata ? parseJson(event.metadata) : null;
  return {
    ...(isRecord(metadata) ? metadata : {}),
    threadSeq: event.threadSeq,
    seq: event.seq,
    runId: event.runId,
    type: event.type,
    timestamp: event.timestamp,
    conversational: event.conversational,
    ...(event.clientEventId ? { clientEventId: event.clientEventId } : {}),
  };
}

function planPayload(plan: ThreadExportPlan | null): Record<string, unknown> {
  if (!plan) {
    return { plan: null };
  }
  const snapshot = parseJson(plan.snapshot);
  return {
    plan: snapshot ?? null,
    ...(snapshot === null ? { raw: plan.snapshot } : {}),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stampOf(iso: string): string {
  const value = iso.replace(/[:.]/g, '-');
  return value.endsWith('Z') ? value.slice(0, -1) : value;
}

class ByteQueue {
  private readonly chunks: Uint8Array[] = [];
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private failure: unknown = null;

  constructor(private readonly highWater: number) {}

  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  fail(error: unknown): void {
    this.failure = error;
    this.closed = true;
    this.wake();
  }

  async read(): Promise<Uint8Array | null> {
    for (;;) {
      const chunk = this.chunks.shift();
      if (chunk) {
        return chunk;
      }
      if (this.failure !== null) {
        throw this.failure;
      }
      if (this.closed) {
        return null;
      }
      await this.waitForChange();
    }
  }

  async waitBelow(): Promise<void> {
    for (;;) {
      if (this.failure !== null) {
        throw this.failure;
      }
      if (this.closed || this.chunks.length <= this.highWater) {
        return;
      }
      await this.waitForChange();
    }
  }

  private waitForChange(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.add(resolve);
    });
  }

  private wake(): void {
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter();
    }
  }
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
