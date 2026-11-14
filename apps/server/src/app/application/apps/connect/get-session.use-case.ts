import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from '../../../domain/apps/connect-view.ts';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import { SessionNotFoundException } from '../../../domain/apps/errors.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import type { ConnectSession } from '../../../domain/apps/records.ts';

export interface SessionRequest {
  orgId: string;
  sessionId: string;
  principalId?: string;
}

@Injectable()
export class GetConnectSessionUseCase {
  constructor(
    private readonly sessions: ConnectSessionStorePort,
    private readonly clock: ClockPort,
  ) {}

  execute(request: SessionRequest): { session: SessionEvent } {
    const session = this.requireSession(request);
    return { session: toEvent(session, this.clock.now()) };
  }

  subscribe(request: SessionRequest, listener: (event: SessionEvent) => void): () => void {
    this.requireSession(request);
    return this.sessions.watch(request.sessionId, (session) => {
      listener(toEvent(session, this.clock.now()));
    });
  }

  openLaunch(token: string): ConnectSession | null {
    const session = this.sessions.findByLaunchToken(token);
    if (
      !session?.launchHtml ||
      session.launchUsed ||
      session.status !== 'pending' ||
      session.expiresAt < this.clock.now()
    ) {
      return null;
    }
    session.launchUsed = true;
    this.sessions.save(session);
    return session;
  }

  private requireSession(request: SessionRequest): ConnectSession {
    const session = this.sessions.findById(request.orgId, request.sessionId);
    if (
      !session ||
      (request.principalId !== undefined && session.principalId !== request.principalId)
    ) {
      throw new SessionNotFoundException(request.sessionId);
    }
    return session;
  }
}

@Injectable()
export class CancelConnectUseCase {
  constructor(private readonly sessions: ConnectSessionStorePort) {}

  execute(request: SessionRequest): void {
    const session = this.sessions.findById(request.orgId, request.sessionId);
    if (
      !session ||
      (request.principalId !== undefined && session.principalId !== request.principalId)
    ) {
      return;
    }
    this.sessions.remove(request.orgId, request.sessionId);
  }
}

export function toEvent(session: ConnectSession, now: number): SessionEvent {
  if (session.status === 'completed' && session.result) {
    return {
      status: 'completed',
      target: session.result.target,
      id: session.result.id,
    };
  }
  if (session.status === 'failed') {
    return failedEvent(session.error ?? 'unknown', session.retryAfterSec);
  }
  if (session.expiresAt < now) {
    return { status: 'failed', error: 'session_expired' };
  }
  return { status: 'pending' };
}

function failedEvent(error: AccountErrorCode, retryAfterSec: number | null): SessionEvent {
  if (retryAfterSec !== null) {
    return { status: 'failed', error, retryAfterSec };
  }
  return { status: 'failed', error };
}
