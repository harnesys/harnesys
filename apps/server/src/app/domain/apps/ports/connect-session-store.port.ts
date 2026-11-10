import type { ConnectSession } from '../records.ts';

export abstract class ConnectSessionStorePort {
  abstract create(session: ConnectSession): void;
  abstract save(session: ConnectSession): void;
  abstract findById(orgId: string, sessionId: string): ConnectSession | null;
  abstract findByState(state: string): ConnectSession | null;
  abstract findByLaunchToken(token: string): ConnectSession | null;
  abstract remove(orgId: string, sessionId: string): boolean;
  abstract countLive(orgId: string, now: number): number;
  abstract sweep(now: number): void;
  abstract watch(sessionId: string, listener: (session: ConnectSession) => void): () => void;
}
