import type { CloudDriveSyncSource } from '../source/drivers/cloud/cloud-sync-back.ts';
import { resolveFleetSecretByOperation } from './fleet-secret-resolver.ts';
import type { DialerSession } from './worker-dialer.session.ts';

export interface WorkerCloudCredentialLease {
  credential: string;
  release(): Promise<void>;
}

export async function resolveWorkerCloudCredential(
  session: DialerSession,
  source: CloudDriveSyncSource,
): Promise<WorkerCloudCredentialLease> {
  const grant = await requestWorkerCloudGrant(session, source.id);
  const secretName = grant.secretName;
  try {
    const values = await resolveFleetSecretByOperation({
      relayUrl: session.identity.relayUrl,
      orgId: session.identity.orgId,
      token: session.identity.token,
      operationId: grant.operationId,
      names: [secretName],
    });
    const credential = values[secretName];
    if (!credential) {
      throw new Error('cloud sync credential unavailable');
    }
    return {
      credential,
      release: () => releaseWorkerCloudSync(session, source.id, grant.operationId),
    };
  } catch (err) {
    await releaseWorkerCloudSync(session, source.id, grant.operationId);
    throw err;
  }
}

interface WorkerCloudGrant {
  operationId: string;
  secretName: string;
}

async function requestWorkerCloudGrant(
  session: DialerSession,
  sourceId: string,
): Promise<WorkerCloudGrant> {
  const response = await fetch(
    `${session.identity.relayUrl.replace(/\/+$/, '')}/api/fleet/cloud-sync/grant`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.identity.token}`,
        'Content-Type': 'application/json',
        'X-Org-Id': session.identity.orgId,
      },
      body: JSON.stringify({ sourceId }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`cloud sync grant failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { operationId?: string; secretName?: string };
  if (typeof body.operationId !== 'string' || typeof body.secretName !== 'string') {
    throw new Error('cloud sync grant response has no operationId/secretName');
  }
  return { operationId: body.operationId, secretName: body.secretName };
}

async function releaseWorkerCloudSync(
  session: DialerSession,
  sourceId: string,
  operationId: string,
): Promise<void> {
  const response = await fetch(
    `${session.identity.relayUrl.replace(/\/+$/, '')}/api/fleet/cloud-sync/complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.identity.token}`,
        'Content-Type': 'application/json',
        'X-Org-Id': session.identity.orgId,
      },
      body: JSON.stringify({ sourceId, operationId }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`cloud sync completion failed: HTTP ${response.status}`);
  }
}
