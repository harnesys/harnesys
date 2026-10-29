import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type TaskEnvelope, TaskEnvelopeSchema } from '@harnesys/contracts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

function recordPath(layout: HostFsLayoutPort, orgId: string, runId: string): string {
  return join(layout.orgDir(orgId), 'placed-runs', `${runId}.json`);
}

export function writePlacedRunRecord(
  layout: HostFsLayoutPort,
  orgId: string,
  envelope: TaskEnvelope,
): void {
  const dir = join(layout.orgDir(orgId), 'placed-runs');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(recordPath(layout, orgId, envelope.runId), JSON.stringify(envelope), {
    mode: 0o600,
  });
}

export function readPlacedRunRecord(
  layout: HostFsLayoutPort,
  orgId: string,
  runId: string,
): TaskEnvelope | null {
  try {
    const raw = readFileSync(recordPath(layout, orgId, runId), 'utf8');
    const parsed = TaskEnvelopeSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function deletePlacedRunRecord(
  layout: HostFsLayoutPort,
  orgId: string,
  runId: string,
): void {
  try {
    unlinkSync(recordPath(layout, orgId, runId));
  } catch {
    // already gone
  }
}
