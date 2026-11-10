import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from '../../../domain/apps/connect-view.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import { ConnectResumeExecutor } from './resume-executor.ts';

export interface ResumeConnectRequest {
  state: string;
  params: Record<string, string>;
}

@Injectable()
export class ResumeConnectUseCase {
  constructor(
    private readonly sessions: ConnectSessionStorePort,
    private readonly clock: ClockPort,
    private readonly executor: ConnectResumeExecutor,
  ) {}

  async execute(request: ResumeConnectRequest): Promise<SessionEvent> {
    const session = this.sessions.findByState(request.state);
    if (!session || session.stateUsed || session.expiresAt < this.clock.now()) {
      return { status: 'failed', error: 'session_expired' };
    }
    session.stateUsed = true;
    this.sessions.save(session);
    return (await this.executor.run(session, request.params)).event;
  }
}
