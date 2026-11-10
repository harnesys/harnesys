import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { ConnectStartResponse, LaunchView } from '../../../domain/apps/connect-view.ts';
import {
  AppRequiredException,
  AppsException,
  KindUnknownException,
  ProviderError,
} from '../../../domain/apps/errors.ts';
import type { FieldValue } from '../../../domain/apps/field.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
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
  ConnectStep,
  Launch,
} from '../../../domain/apps/provider-module.ts';
import type {
  AccountRecord,
  AppRecord,
  ConnectSession,
  ConnectTarget,
} from '../../../domain/apps/records.ts';
import { resolveInputFields } from '../shared/field-validation.ts';
import { assertKnownScopes, unionScopes } from '../shared/scope-coverage.ts';
import { ConnectContextPort } from './connect-context.port.ts';
import { ConnectFinalizePort } from './connect-finalize.port.ts';
import { ConnectScheduler } from './connect-scheduler.ts';
import { requireExistingAccount } from './start-support.ts';
import { clampTtl, DEFAULT_TTL_SEC } from './ttl.ts';
import { applyWaitLaunch } from './wait-launch.ts';

const MAX_LIVE_SESSIONS = 20;

export interface StartConnectRequest {
  orgId: string;
  principalId: string;
  target: ConnectTarget;
  kind: string;
  appId?: string;
  accountId?: string;
  inputs?: Record<string, FieldValue>;
  scopes?: string[];
}

interface ResolvedAppStart {
  target: 'app';
  module: AppKindModule;
  app: null;
  appModule: null;
  existing: null;
}

interface ResolvedAccountStart {
  target: 'account';
  module: AccountKindModule;
  app: AppRecord | null;
  appModule: AppKindModule | null;
  existing: AccountRecord | null;
}

type ResolvedStart = ResolvedAppStart | ResolvedAccountStart;

@Injectable()
export class StartConnectUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly registry: ProviderRegistryPort,
    private readonly apps: AppRepositoryPort,
    readonly _accounts: AccountRepositoryPort,
    private readonly sessions: ConnectSessionStorePort,
    private readonly context: ConnectContextPort,
    private readonly finalizer: ConnectFinalizePort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly scheduler: ConnectScheduler,
    private readonly metrics: MetricsPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-connect');
  }

  async execute(request: StartConnectRequest): Promise<ConnectStartResponse> {
    const resolved = this.resolve(request);
    const inputs = this.resolveInputs(resolved, request);
    const scopes = this.resolveScopes(resolved, request);
    const session = this.buildSession(request, resolved, inputs, scopes);
    try {
      const step =
        resolved.target === 'app'
          ? await this.startApp(resolved.module, session)
          : await this.startAccount(resolved.module, resolved.appModule, session);
      return await this.handleStep(session, resolved, step);
    } catch (error) {
      this.metrics.increment('apps_connect_total', {
        provider: resolved.module.descriptor.provider,
        kind: request.kind,
        outcome: error instanceof ProviderError ? error.code : 'unknown',
      });
      this.logger.info({ kind: request.kind, target: request.target }, 'connect start failed');
      throw this.asAppsError(error);
    }
  }

  private startApp(
    module: AppKindModule,
    session: ConnectSession,
  ): Promise<ConnectStep<AppSetupResult>> {
    if (!module.setup) {
      throw new KindUnknownException(session.kind);
    }
    return module.setup.start(
      this.context.start(
        { session, module, app: null, appModule: null, existing: null, providerState: {} },
        session.state,
      ),
    );
  }

  private startAccount(
    module: AccountKindModule,
    appModule: AppKindModule | null,
    session: ConnectSession,
  ): Promise<ConnectStep<AccountConnectResult>> {
    return module.connect.start(
      this.context.start(
        {
          session,
          module,
          app: this.context.appFor(session),
          appModule,
          existing: this.context.existingFor(session),
          providerState: {},
        },
        session.state,
      ),
    );
  }

  private async handleStep(
    session: ConnectSession,
    resolved: ResolvedStart,
    step: ConnectStep<unknown>,
  ): Promise<ConnectStartResponse> {
    if (step.type === 'done') {
      return this.complete(session, resolved, step.result);
    }
    session.providerState = step.state;
    session.expiresAt = this.clock.now() + clampTtl(step.ttlSec) * 1000;
    session.status = 'pending';
    this.applyLaunch(session, step.launch);
    this.sessions.create(session);
    this.metrics.increment('apps_connect_total', {
      provider: resolved.module.descriptor.provider,
      kind: session.kind,
      outcome: 'pending',
    });
    return {
      status: 'pending',
      sessionId: session.id,
      launch: this.launchView(session, step.launch),
      expiresAt: session.expiresAt,
    };
  }

  private async complete(
    session: ConnectSession,
    resolved: ResolvedStart,
    result: unknown,
  ): Promise<ConnectStartResponse> {
    if (resolved.target === 'app') {
      const record = await this.finalizer.finalizeApp({
        orgId: session.orgId,
        appId: session.appId ?? crypto.randomUUID(),
        module: resolved.module,
        result: result as AppSetupResult,
      });
      this.metrics.increment('apps_connect_total', {
        provider: resolved.module.descriptor.provider,
        kind: session.kind,
        outcome: 'ok',
      });
      return { status: 'completed', target: 'app', id: record.id };
    }
    const record = await this.finalizer.finalizeAccount({
      orgId: session.orgId,
      module: resolved.module,
      app: resolved.app,
      result: result as AccountConnectResult,
      existing: resolved.existing,
      inputs: session.inputs,
    });
    this.metrics.increment('apps_connect_total', {
      provider: resolved.module.descriptor.provider,
      kind: session.kind,
      outcome: 'ok',
    });
    return { status: 'completed', target: 'account', id: record.id };
  }

  private resolve(request: StartConnectRequest): ResolvedStart {
    if (request.target === 'app') {
      const module = this.registry.appKind(request.kind);
      if (!module?.setup) {
        throw new KindUnknownException(request.kind);
      }
      return { target: 'app', module, app: null, appModule: null, existing: null };
    }
    const module = this.registry.requireAccountKind(request.kind);
    const existing = request.accountId
      ? requireExistingAccount(this._accounts, request.orgId, request.accountId, request.kind)
      : null;
    const app = this.resolveApp(request, module, existing);
    return {
      target: 'account',
      module,
      app,
      appModule: app ? this.registry.appKind(app.kind) : null,
      existing,
    };
  }

  private resolveApp(
    request: StartConnectRequest,
    module: AccountKindModule,
    existing: AccountRecord | null,
  ) {
    if (module.descriptor.requiresApp.length === 0) {
      return null;
    }
    const appId = existing?.appId ?? request.appId;
    if (!appId) {
      throw new AppRequiredException();
    }
    const app = this.apps.findById(request.orgId, appId);
    if (!app || !module.descriptor.requiresApp.includes(app.kind)) {
      throw new AppRequiredException();
    }
    return app;
  }

  private resolveInputs(
    resolved: ResolvedStart,
    request: StartConnectRequest,
  ): Record<string, FieldValue> {
    const fields =
      resolved.target === 'app'
        ? resolved.module.descriptor.fields
        : resolved.module.descriptor.inputs;
    return resolveInputFields(fields, request.inputs ?? {}, {
      requireRequired: resolved.target !== 'app',
    }).values;
  }

  private resolveScopes(resolved: ResolvedStart, request: StartConnectRequest): string[] {
    if (resolved.target === 'app') {
      return [];
    }
    const options = resolved.module.descriptor.scopes.options.map((option) => option.key);
    const requested = unionScopes(
      request.scopes ?? resolved.module.descriptor.scopes.defaults,
      resolved.existing?.scopes ?? [],
    );
    assertKnownScopes(options, requested);
    return requested;
  }

  private buildSession(
    request: StartConnectRequest,
    resolved: ResolvedStart,
    inputs: Record<string, FieldValue>,
    scopes: string[],
  ): ConnectSession {
    const now = this.clock.now();
    if (this.sessions.countLive(request.orgId, now) >= MAX_LIVE_SESSIONS) {
      throw new AppsException('too_many_sessions', 429, 'Too many connect sessions');
    }
    return {
      id: crypto.randomUUID(),
      state: randomBytes(32).toString('base64url'),
      orgId: request.orgId,
      principalId: request.principalId,
      target: request.target,
      kind: request.kind,
      appId: resolved.target === 'app' ? crypto.randomUUID() : (resolved.app?.id ?? null),
      accountId: request.accountId ?? null,
      inputs,
      scopes,
      providerState: {},
      status: 'pending',
      result: null,
      error: null,
      launchToken: null,
      launchHtml: null,
      launchFormHosts: [],
      launchFormFields: [],
      launchUsed: false,
      stateUsed: false,
      resumeCount: 0,
      retryAfterSec: null,
      createdAt: now,
      expiresAt: now + DEFAULT_TTL_SEC * 1000,
    };
  }

  private applyLaunch(session: ConnectSession, launch: Launch): void {
    applyWaitLaunch(session, launch);
    if (launch.kind === 'device') {
      this.scheduler.schedule(session.orgId, session.id, launch.intervalSec);
    }
  }

  private launchView(session: ConnectSession, launch: Launch): LaunchView {
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
    return { kind: 'page', url: this.urls.launchPageUrl(session.launchToken ?? '') };
  }

  private asAppsError(error: unknown): Error {
    if (error instanceof ProviderError) {
      return new AppsException(error.code, 502, 'Provider connection failed');
    }
    return error instanceof Error ? error : new Error('Connect failed');
  }
}
