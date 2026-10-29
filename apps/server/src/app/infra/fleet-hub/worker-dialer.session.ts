import type { OrgNodeIdentity, TaskEnvelope } from '@harnesys/contracts';
import type { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import type { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { openWorkerSocket, type WorkerSocket, workerWsUrl } from './worker-dialer.util.ts';

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const WS_PING_INTERVAL_MS = 25_000;
export const WS_BACKOFF_MIN_MS = 1_000;
export const WS_BACKOFF_MAX_MS = 30_000;

export interface DialerSession {
  identity: OrgNodeIdentity;
  socket: WorkerSocket | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
  stopped: boolean;
  snapshotReady: boolean;

  pendingPlaces: TaskEnvelope[];
}

export function syncDialerSessions(input: {
  sessions: Map<string, DialerSession>;
  store: OrgMachineStore;
  identities: NodeIdentityStore;
  dial: (session: DialerSession) => void;
  teardown: (session: DialerSession, reason: string) => void;
}): void {
  const workers = input.store.list().filter((entry) => entry.role === 'worker');
  const wanted = new Set<string>();
  for (const entry of workers) {
    const identity = input.identities.read(entry.orgId);
    if (!identity) {
      continue;
    }
    wanted.add(identity.orgId);
    const existing = input.sessions.get(identity.orgId);
    if (existing) {
      existing.identity = identity;
      continue;
    }
    const session: DialerSession = {
      identity,
      socket: null,
      pingTimer: null,
      reconnectTimer: null,
      backoffMs: WS_BACKOFF_MIN_MS,
      stopped: false,
      snapshotReady: false,
      pendingPlaces: [],
    };
    input.sessions.set(identity.orgId, session);
    input.dial(session);
  }
  for (const [orgId, session] of input.sessions) {
    if (!wanted.has(orgId)) {
      input.teardown(session, 'org removed');
      input.sessions.delete(orgId);
    }
  }
}

export function teardownDialerSession(
  session: DialerSession,
  reason: string,
  clearTimers: (session: DialerSession) => void,
): void {
  session.stopped = true;
  session.snapshotReady = false;
  session.pendingPlaces = [];
  clearTimers(session);
  try {
    session.socket?.close(1000, reason);
  } catch {
    // ignore
  }
}

export async function pingRelayHttp(relayUrl: string, orgId: string, token: string): Promise<void> {
  const base = relayUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/fleet/heartbeat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Org-Id': orgId,
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export function openDialerSocket(session: DialerSession): WorkerSocket | null {
  try {
    return openWorkerSocket(workerWsUrl(session.identity.relayUrl));
  } catch {
    return null;
  }
}

export function scheduleDialerReconnect(
  session: DialerSession,
  dial: (session: DialerSession) => void,
): void {
  if (session.stopped || session.reconnectTimer) {
    return;
  }
  const delay = session.backoffMs;
  session.backoffMs = Math.min(session.backoffMs * 2, WS_BACKOFF_MAX_MS);
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    dial(session);
  }, delay);
}
