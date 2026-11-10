import { Injectable } from '@harnesys/brix';
import type { ConnectResumeResponse } from '../../../domain/apps/connect-view.ts';
import { SessionNotFoundException } from '../../../domain/apps/errors.ts';
import type { FieldValue } from '../../../domain/apps/field.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import type { ConnectSession } from '../../../domain/apps/records.ts';
import { resolveInputFields } from '../shared/field-validation.ts';
import { ConnectResumeExecutor } from './resume-executor.ts';

export const MAX_SESSION_RESUMES = 25;

export interface ResumeFormConnectRequest {
  orgId: string;
  sessionId: string;
  principalId: string;
  inputs: Record<string, FieldValue>;
}

@Injectable()
export class ResumeFormConnectUseCase {
  constructor(
    private readonly sessions: ConnectSessionStorePort,
    private readonly clock: ClockPort,
    private readonly executor: ConnectResumeExecutor,
  ) {}

  async execute(request: ResumeFormConnectRequest): Promise<ConnectResumeResponse> {
    const session = this.requireFormSession(request);
    session.resumeCount += 1;
    const now = this.clock.now();
    if (session.resumeCount > MAX_SESSION_RESUMES || session.expiresAt < now) {
      return this.failExpired(session, now);
    }
    const resolved = resolveInputFields(session.launchFormFields, request.inputs);
    session.inputs = { ...session.inputs, ...resolved.values };
    const outcome = await this.executor.run(session, resumeParams(resolved.values));
    return { session: outcome.event, ...(outcome.launch ? { launch: outcome.launch } : {}) };
  }

  private requireFormSession(request: ResumeFormConnectRequest): ConnectSession {
    const session = this.sessions.findById(request.orgId, request.sessionId);
    if (!session || session.principalId !== request.principalId) {
      throw new SessionNotFoundException(request.sessionId);
    }
    if (session.status !== 'pending' || session.launchFormFields.length === 0) {
      throw new SessionNotFoundException(request.sessionId);
    }
    return session;
  }

  private failExpired(session: ConnectSession, now: number): ConnectResumeResponse {
    session.status = 'failed';
    session.error = 'session_expired';
    session.retryAfterSec = null;
    session.expiresAt = now + 120_000;
    this.sessions.save(session);
    return { session: { status: 'failed', error: 'session_expired' } };
  }
}

function resumeParams(values: Record<string, FieldValue>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    params[key] = String(value);
  }
  return params;
}
