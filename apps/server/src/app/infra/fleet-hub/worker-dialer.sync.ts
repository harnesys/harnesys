import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  OrgExecutionSnapshot,
  OrgNodeIdentity,
  RunEventAckFrame,
  TaskEnvelopeAttachment,
} from '@harnesys/contracts';
import {
  ConnectedFrameSchema,
  OrgExecutionSnapshotSchema,
  RunEventAckFrameSchema,
} from '@harnesys/contracts';
import type { Attachment, RunAttribution, SessionEvent } from 'harnesys';
import type { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import type { PendingRunEventPort } from '../../domain/fleet/pending-run-event.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { attachmentRelPath, sanitizeFileName } from '../../domain/thread/attachment.ts';

export function parseConnectedSnapshot(
  frame: Record<string, unknown>,
): OrgExecutionSnapshot | null {
  const parsed = ConnectedFrameSchema.safeParse(frame);
  if (parsed.success) {
    return parsed.data.snapshot;
  }
  if (frame.snapshot) {
    const snap = OrgExecutionSnapshotSchema.safeParse(frame.snapshot);
    return snap.success ? snap.data : null;
  }
  return null;
}

export function applyConnectedSnapshot(
  replica: OrgExecutionReplicaPort,
  orgId: string,
  snapshot: OrgExecutionSnapshot,
): {
  kind: 'SNAPSHOT_ACK';
  revision: number;
  status: 'accepted' | 'incompatible';
  reason?: string;
} {
  const result = replica.apply(orgId, snapshot);
  return {
    kind: 'SNAPSHOT_ACK',
    revision: result.revision,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

export interface RunEventBatchInput {
  pending: PendingRunEventPort;
  orgId: string;
  runId: string;
  leaseEpoch: number;
  attribution: RunAttribution | null;
  events: SessionEvent[];
}

export function persistRunEventBatch(input: RunEventBatchInput): void {
  const now = new Date().toISOString();
  for (const event of input.events) {
    if (typeof event.seq !== 'number') {
      continue;
    }
    input.pending.insert(input.orgId, {
      runId: input.runId,
      leaseEpoch: input.leaseEpoch,
      seq: event.seq,
      attribution: input.attribution ?? undefined,
      payloadJson: JSON.stringify(event),
      createdAt: now,
    });
  }
}

export function handleRunEventAckFrame(
  pending: PendingRunEventPort,
  orgId: string,
  frame: Record<string, unknown>,
): void {
  const parsed = RunEventAckFrameSchema.safeParse(frame);
  if (!parsed.success) {
    return;
  }
  const ack: RunEventAckFrame = parsed.data;
  const all = pending.listAllPending(orgId).filter((row) => row.runId === ack.runId);
  const epochs = new Set(all.map((row) => row.leaseEpoch));
  for (const leaseEpoch of epochs) {
    pending.ackThrough(orgId, ack.runId, leaseEpoch, ack.lastSeq);
  }
}

export function replayPendingRunEvents(
  pending: PendingRunEventPort,
  orgId: string,
  send: (payload: string) => void,
): void {
  const rows = pending.listAllPending(orgId);
  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.runId}:${row.leaseEpoch}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  for (const group of byKey.values()) {
    const sorted = group.sort((a, b) => a.seq - b.seq);
    const first = sorted[0];
    if (!first) {
      continue;
    }
    const events = sorted.map((row) => JSON.parse(row.payloadJson) as SessionEvent);
    send(
      JSON.stringify({
        kind: 'RUN_EVENT',
        runId: first.runId,
        leaseEpoch: first.leaseEpoch,
        fromSeq: Math.max(0, first.seq - 1),
        events,
      }),
    );
  }
}

export async function fetchRunAttachments(input: {
  identity: OrgNodeIdentity;
  threadId: string;
  runId: string;
  metas: TaskEnvelopeAttachment[];
  layout: HostFsLayoutPort;
  fetchImpl?: typeof fetch;
}): Promise<Attachment[]> {
  if (input.metas.length === 0) {
    return [];
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.identity.relayUrl.replace(/\/+$/, '');
  const threadDir = input.layout.ensureThreadDir(input.identity.orgId, input.threadId);
  const out: Attachment[] = [];
  for (const meta of input.metas) {
    const response = await fetchImpl(`${base}/api/fleet/runs/attachments/fetch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.identity.token}`,
        'Content-Type': 'application/json',
        'X-Org-Id': input.identity.orgId,
      },
      body: JSON.stringify({
        runId: input.runId,
        threadId: input.threadId,
        attachmentId: meta.id,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`attachment fetch failed: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fileName = sanitizeFileName(meta.name);
    const rel = attachmentRelPath(meta.id, fileName);
    const abs = join(threadDir, rel);
    mkdirSync(join(threadDir, 'attachments', meta.id), { recursive: true, mode: 0o700 });
    writeFileSync(abs, bytes, { mode: 0o600 });
    out.push({
      id: meta.id,
      kind: meta.kind,
      name: meta.name,
      mediaType: meta.mediaType,
      path: abs,
    });
  }
  return out;
}
