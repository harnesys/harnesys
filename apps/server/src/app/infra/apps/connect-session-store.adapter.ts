import { Injectable } from '@harnesys/brix';
import { SessionNotFoundException } from '../../domain/apps/errors.ts';
import { ConnectSessionStorePort } from '../../domain/apps/ports/connect-session-store.port.ts';
import type { ConnectSession } from '../../domain/apps/records.ts';

@Injectable()
export class ConnectSessionStoreAdapter extends ConnectSessionStorePort {
  private readonly byId = new Map<string, ConnectSession>();
  private readonly stateIndex = new Map<string, string>();
  private readonly launchIndex = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(session: ConnectSession) => void>>();

  create(session: ConnectSession): void {
    this.save(session);
  }

  save(session: ConnectSession): void {
    this.byId.set(session.id, session);
    this.stateIndex.set(session.state, session.id);
    if (session.launchToken) {
      this.launchIndex.set(session.launchToken, session.id);
    }
    this.notify(session);
  }

  findById(orgId: string, sessionId: string): ConnectSession | null {
    const session = this.byId.get(sessionId);
    return session && session.orgId === orgId ? session : null;
  }

  findByState(state: string): ConnectSession | null {
    const id = this.stateIndex.get(state);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  findByLaunchToken(token: string): ConnectSession | null {
    const id = this.launchIndex.get(token);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  remove(orgId: string, sessionId: string): boolean {
    const session = this.findById(orgId, sessionId);
    if (!session) {
      return false;
    }
    session.status = 'failed';
    session.error = 'session_expired';
    this.notify(session);
    this.byId.delete(session.id);
    this.stateIndex.delete(session.state);
    if (session.launchToken) {
      this.launchIndex.delete(session.launchToken);
    }
    return true;
  }

  countLive(orgId: string, now: number): number {
    let count = 0;
    for (const session of this.byId.values()) {
      if (session.orgId === orgId && session.status === 'pending' && session.expiresAt >= now) {
        count += 1;
      }
    }
    return count;
  }

  sweep(now: number): void {
    for (const session of [...this.byId.values()]) {
      if (session.expiresAt < now) {
        session.status = 'failed';
        session.error = 'session_expired';
        this.notify(session);
        this.byId.delete(session.id);
        this.stateIndex.delete(session.state);
        if (session.launchToken) {
          this.launchIndex.delete(session.launchToken);
        }
        this.listeners.delete(session.id);
      }
    }
  }

  watch(sessionId: string, listener: (session: ConnectSession) => void): () => void {
    if (!this.byId.has(sessionId)) {
      throw new SessionNotFoundException(sessionId);
    }
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(listener);
    this.listeners.set(sessionId, set);
    return () => {
      set.delete(listener);
    };
  }

  private notify(session: ConnectSession): void {
    const set = this.listeners.get(session.id);
    if (!set) {
      return;
    }
    for (const listener of set) {
      listener(session);
    }
  }
}
