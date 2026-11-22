import type { ThreadMember, ThreadParticipant } from '@harnesys/contracts';
import { strToU8, zipSync } from 'fflate';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type {
  ThreadExportEvent,
  ThreadExportPlan,
  ThreadExportRun,
  ThreadExportSnapshot,
} from '../../domain/thread/thread-export-reader.port.ts';

export interface ThreadExportFile {
  name: string;
  bytes: Uint8Array;
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
  rawRequests: ThreadExportFile[];
  toolOutputs: ThreadExportFile[];
  exportedAt: string;
}

export interface ThreadExportBundle {
  fileName: string;
  bytes: Uint8Array;
}

const FORMAT = 'harnesys.thread-dump';
const FORMAT_VERSION = 1;

export function buildThreadExportBundle(input: ThreadExportBundleInput): ThreadExportBundle {
  const files: Record<string, Uint8Array> = {};
  const errorEvents = input.events.filter(
    (event) => event.type === 'error' || event.type === 'run.failed',
  );
  const compactions = input.events.filter((event) => event.type === 'compaction');
  files['thread.json'] = jsonBytes({
    thread: input.thread,
    members: input.members,
    participants: input.participants,
    lastError: input.thread.metadata.lastError ?? null,
  });
  files['events.jsonl'] = strToU8(
    input.events.map((event) => JSON.stringify(eventLine(event))).join('\n'),
  );
  files['errors.json'] = jsonBytes({
    lastError: input.thread.metadata.lastError ?? null,
    events: errorEvents.map(eventLine),
  });
  files['compactions.json'] = jsonBytes({ events: compactions.map(eventLine) });
  files['runs.json'] = jsonBytes({ runs: input.runs });
  files['snapshots.json'] = jsonBytes({
    snapshots: input.snapshots.map((snapshot) => ({
      ...snapshot,
      snapshot: parseJson(snapshot.snapshot) ?? snapshot.snapshot,
    })),
  });
  files['plan.json'] = jsonBytes(planPayload(input.plan));
  files['attachments.json'] = jsonBytes({ attachments: input.attachments });
  for (const file of input.rawRequests) {
    files[`raw-model-requests/${file.name}`] = file.bytes;
  }
  for (const file of input.toolOutputs) {
    files[`tool-outputs/${file.name}`] = file.bytes;
  }
  files['manifest.json'] = jsonBytes({
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
      rawModelRequests: input.rawRequests.length,
      toolOutputs: input.toolOutputs.length,
      attachments: input.attachments.length,
      members: input.members.length,
      participants: input.participants.length,
    },
    files: Object.keys(files).sort(),
  });
  return {
    fileName: `harnesys-thread-${input.thread.id}-${stampOf(input.exportedAt)}.zip`,
    bytes: zipSync(files, { level: 6 }),
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
