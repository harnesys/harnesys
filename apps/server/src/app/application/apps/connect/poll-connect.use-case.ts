import { Injectable } from '@harnesys/brix';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import { ProviderError, providerRetryAfterSec } from '../../../domain/apps/errors.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
} from '../../../domain/apps/provider-module.ts';
import type { AppRecord, ConnectSession } from '../../../domain/apps/records.ts';
import { ConnectContextPort } from './connect-context.port.ts';
import { ConnectFinalizePort } from './connect-finalize.port.ts';
import { applyWaitLaunch } from './wait-launch.ts';

export type PollOutcome = 'pending' | 'terminal';

const MAX_TTL_SEC = 3600;

export interface PollConnectRequest {
  orgId: string;
  sessionId: string;
}

@Injectable()
export class PollConnectUseCase {
  constructor(
    private readonly sessions: ConnectSessionStorePort,
    private readonly registry: ProviderRegistryPort,
    private readonly context: ConnectContextPort,
    private readonly finalizer: ConnectFinalizePort,
    private readonly clock: ClockPort,
  ) {}

  async execute(request: PollConnectRequest): Promise<PollOutcome> {
    const session = this.sessions.findById(request.orgId, request.sessionId);
    if (session?.status !== 'pending' || session.target !== 'account') {
      return 'terminal';
    }
    if (session.expiresAt < this.clock.now()) {
      this.fail(session, 'session_expired', null);
      return 'terminal';
    }
    const module = this.registry.accountKind(session.kind);
    if (!module?.connect.poll) {
      return 'terminal';
    }
    try {
      const app = this.context.appFor(session);
      const appModule = app ? this.registry.appKind(app.kind) : null;
      const step = await module.connect.poll(
        this.context.poll({
          session,
          module,
          app,
          appModule,
          existing: this.context.existingFor(session),
          providerState: session.providerState,
        }),
      );
      if (step.type === 'pending') {
        return 'pending';
      }
      if (step.type === 'wait') {
        session.providerState = step.state;
        session.expiresAt = this.clock.now() + Math.min(step.ttlSec, MAX_TTL_SEC) * 1000;
        applyWaitLaunch(session, step.launch);
        this.sessions.save(session);
        return 'pending';
      }
      await this.complete(session, module, app, step.result);
      return 'terminal';
    } catch (error) {
      this.fail(
        session,
        error instanceof ProviderError ? error.code : 'unknown',
        error instanceof ProviderError ? providerRetryAfterSec(error) : null,
      );
      return 'terminal';
    }
  }

  private async complete(
    session: ConnectSession,
    module: AccountKindModule,
    app: AppRecord | null,
    result: AccountConnectResult,
  ): Promise<void> {
    const record = await this.finalizer.finalizeAccount({
      orgId: session.orgId,
      module,
      app,
      result,
      existing: this.context.existingFor(session),
      inputs: session.inputs,
    });
    session.status = 'completed';
    session.result = { target: 'account', id: record.id };
    session.expiresAt = this.clock.now() + 120_000;
    this.sessions.save(session);
  }

  private fail(
    session: ConnectSession,
    code: AccountErrorCode,
    retryAfterSec: number | null,
  ): void {
    session.status = 'failed';
    session.error = code;
    session.retryAfterSec = retryAfterSec;
    session.expiresAt = this.clock.now() + 120_000;
    this.sessions.save(session);
  }
}
