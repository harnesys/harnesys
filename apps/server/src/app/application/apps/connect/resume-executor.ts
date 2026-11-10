import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { LaunchView, SessionEvent } from '../../../domain/apps/connect-view.ts';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import { ProviderError, providerRetryAfterSec } from '../../../domain/apps/errors.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import { MetricsPort } from '../../../domain/apps/ports/metrics.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  AppSetupResult,
  ConnectHandler,
  Launch,
} from '../../../domain/apps/provider-module.ts';
import type { AppRecord, ConnectSession, JsonObject } from '../../../domain/apps/records.ts';
import { ConnectContextPort } from './connect-context.port.ts';
import { ConnectFinalizePort } from './connect-finalize.port.ts';
import { applyWaitLaunch } from './wait-launch.ts';

export interface ConnectResumeOutcome {
  event: SessionEvent;
  launch: LaunchView | null;
}

const DEFAULT_TTL_SEC = 600;
const MAX_TTL_SEC = 3600;

@Injectable()
export class ConnectResumeExecutor {
  private readonly logger: Logger;

  constructor(
    private readonly sessions: ConnectSessionStorePort,
    private readonly registry: ProviderRegistryPort,
    private readonly context: ConnectContextPort,
    private readonly finalizer: ConnectFinalizePort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly metrics: MetricsPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-connect');
  }

  async run(
    session: ConnectSession,
    params: Record<string, string>,
  ): Promise<ConnectResumeOutcome> {
    try {
      return await this.resume(session, params);
    } catch (error) {
      const provider = error instanceof ProviderError;
      const code: AccountErrorCode = provider ? error.code : 'unknown';
      const retryAfterSec = provider ? providerRetryAfterSec(error) : null;
      this.fail(session, code, retryAfterSec);
      this.logger.info({ sessionId: session.id, outcome: code }, 'connect resume failed');
      return { event: failedEvent(code, retryAfterSec), launch: null };
    }
  }

  private async resume(
    session: ConnectSession,
    params: Record<string, string>,
  ): Promise<ConnectResumeOutcome> {
    const module =
      session.target === 'app'
        ? this.registry.requireAppKind(session.kind)
        : this.registry.requireAccountKind(session.kind);
    const handler = (
      session.target === 'app'
        ? (module as AppKindModule).setup
        : (module as AccountKindModule).connect
    ) as ConnectHandler<unknown> | undefined;
    if (!handler?.resume) {
      this.fail(session, 'invalid_response', null);
      return { event: { status: 'failed', error: 'invalid_response' }, launch: null };
    }
    this.metrics.increment('apps_connect_total', {
      provider: module.descriptor.provider,
      kind: session.kind,
      outcome: 'resume',
    });
    const app = this.context.appFor(session);
    const appModule = app ? this.registry.appKind(app.kind) : null;
    const step = await handler.resume(
      this.context.resume({
        session,
        module,
        app,
        appModule,
        existing: this.context.existingFor(session),
        providerState: session.providerState,
        params,
      }),
    );
    if (step.type === 'wait') {
      return this.wait(session, step.state, step.ttlSec, step.launch);
    }
    return this.done(session, app, step.result);
  }

  private wait(
    session: ConnectSession,
    state: JsonObject,
    ttlSec: number,
    launch: Launch,
  ): ConnectResumeOutcome {
    session.providerState = state;
    session.expiresAt = this.clock.now() + clampTtl(ttlSec) * 1000;
    applyWaitLaunch(session, launch);
    this.sessions.save(session);
    return { event: { status: 'pending' }, launch: launchView(session, launch, this.urls) };
  }

  private async done(
    session: ConnectSession,
    app: AppRecord | null,
    result: unknown,
  ): Promise<ConnectResumeOutcome> {
    if (session.target === 'app') {
      const record = await this.finalizer.finalizeApp({
        orgId: session.orgId,
        appId: session.appId ?? crypto.randomUUID(),
        module: this.registry.requireAppKind(session.kind),
        result: result as AppSetupResult,
      });
      this.finish(session, 'app', record.id);
      return { event: { status: 'completed', target: 'app', id: record.id }, launch: null };
    }
    const record = await this.finalizer.finalizeAccount({
      orgId: session.orgId,
      module: this.registry.requireAccountKind(session.kind),
      app,
      result: result as AccountConnectResult,
      existing: this.context.existingFor(session),
      inputs: session.inputs,
    });
    this.finish(session, 'account', record.id);
    return { event: { status: 'completed', target: 'account', id: record.id }, launch: null };
  }

  private finish(session: ConnectSession, target: 'app' | 'account', id: string): void {
    session.status = 'completed';
    session.result = { target, id };
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

function failedEvent(code: AccountErrorCode, retryAfterSec: number | null): SessionEvent {
  if (retryAfterSec !== null) {
    return { status: 'failed', error: code, retryAfterSec };
  }
  return { status: 'failed', error: code };
}

function launchView(session: ConnectSession, launch: Launch, urls: PublicUrlsPort): LaunchView {
  if (launch.kind === 'redirect') {
    return { kind: 'redirect', url: launch.url };
  }
  if (launch.kind === 'device') {
    return {
      kind: 'device',
      userCode: launch.userCode,
      verificationUri: launch.verificationUri,
      intervalSec: launch.intervalSec,
    };
  }
  if (launch.kind === 'form') {
    return {
      kind: 'form',
      fields: [...launch.fields],
      ...(launch.text === undefined ? {} : { text: launch.text }),
    };
  }
  return { kind: 'page', url: urls.launchPageUrl(session.launchToken ?? '') };
}

function clampTtl(ttlSec: number): number {
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    return DEFAULT_TTL_SEC;
  }
  return Math.min(ttlSec, MAX_TTL_SEC);
}
