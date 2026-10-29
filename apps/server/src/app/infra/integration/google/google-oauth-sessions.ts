import { Injectable } from '@harnesys/brix';
import type { GoogleTokenSet } from './google-oauth-device.ts';

export interface GoogleOAuthLoopbackPending {
  status: 'pending-loopback';
  orgId: string;
  state: string;
  verifier: string;
  expiresAt: number;
}

export type GoogleOAuthSessionState =
  | GoogleOAuthLoopbackPending
  | {
      status: 'ready';
      orgId: string;
      tokens: GoogleTokenSet;
      credRef?: string;
      integrationId?: string;
    }
  | { status: 'denied'; orgId: string }
  | { status: 'expired'; orgId: string };

@Injectable()
export class GoogleOAuthSessionStore {
  private readonly sessions = new Map<string, GoogleOAuthSessionState>();

  createLoopback(
    orgId: string,
    entry: { state: string; verifier: string; expiresAt: number },
  ): string {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { status: 'pending-loopback', orgId, ...entry });
    return sessionId;
  }

  findByState(state: string): { sessionId: string; session: GoogleOAuthLoopbackPending } | null {
    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'pending-loopback' && session.state === state) {
        return { sessionId, session };
      }
    }
    return null;
  }

  get(sessionId: string): GoogleOAuthSessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  set(sessionId: string, state: GoogleOAuthSessionState): void {
    this.sessions.set(sessionId, state);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
