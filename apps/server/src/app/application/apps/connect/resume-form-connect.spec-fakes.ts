import type { CatalogResponse } from '../../../domain/apps/descriptors.ts';
import { ProviderError } from '../../../domain/apps/errors.ts';
import type { FieldSpec } from '../../../domain/apps/field.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../../domain/apps/ports/connect-session-store.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  ConnectResumeCtx,
  ConnectStep,
  ProviderModule,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord, ConnectSession } from '../../../domain/apps/records.ts';
import { MetricsPort } from '../../../domain/metrics/metrics.port.ts';
import { silentLogger } from '../../approvals/approval-fakes.ts';
import { ConnectContextPort } from './connect-context.port.ts';
import type { ConnectContextInput } from './connect-context.ts';
import type { FinalizeAccountInput } from './connect-finalize.port.ts';
import { ConnectFinalizePort } from './connect-finalize.port.ts';
import { ConnectResumeExecutor } from './resume-executor.ts';
import { ResumeFormConnectUseCase } from './resume-form-connect.use-case.ts';

export type ResumeImpl =
  | ((ctx: ConnectResumeCtx) => Promise<ConnectStep<AccountConnectResult>>)
  | null;

export const resumeStubs: { impl: ResumeImpl } = { impl: null };

export const PROVIDER_ID = 'specformtest';
export const KIND = 'spec-form-test';
export const NO_RESUME_KIND = 'spec-form-noresume';
export const NOW = 5_000_000;

export const EMAIL_FIELD: FieldSpec = {
  key: 'email',
  label: 'Email',
  type: 'text',
  required: true,
};
export const ATTEMPTS_FIELD: FieldSpec = {
  key: 'attempts',
  label: 'Attempts',
  type: 'number',
  required: false,
};

const formKind: AccountKindModule = {
  descriptor: {
    kind: KIND,
    provider: PROVIDER_ID,
    label: 'Spec form test account',
    description: 'In-memory form resume kind.',
    requiresApp: [],
    inputs: [],
    scopes: { options: [], defaults: [] },
    access: { source: 'stored', keys: [] },
    endpoints: [],
  },
  secrets: ['accessSecret'],
  egress: { hosts: [] },
  connect: {
    async start() {
      throw new ProviderError('invalid_input');
    },
    resume: (ctx) => {
      if (!resumeStubs.impl) {
        throw new ProviderError('invalid_response');
      }
      return resumeStubs.impl(ctx);
    },
  },
  async verify() {
    return { identity: { externalAccountId: 'spec-user' } };
  },
  validateMetadata: () => ({}),
};

const noResumeKind: AccountKindModule = {
  ...formKind,
  descriptor: { ...formKind.descriptor, kind: NO_RESUME_KIND },
  connect: {
    async start() {
      throw new ProviderError('invalid_input');
    },
  },
};

export function connectResult(ctx: ConnectResumeCtx): AccountConnectResult {
  return {
    externalAccountId: 'spec-user',
    label: 'Spec user',
    scopes: ctx.scopes,
    secrets: { accessSecret: 'tok' },
    expiresAt: null,
    metadata: {},
  };
}

function accountRecord(orgId: string, kind: string): AccountRecord {
  return {
    id: 'acc-1',
    orgId,
    appId: null,
    kind,
    externalAccountId: 'spec-user',
    partition: '',
    label: 'Spec user',
    status: 'connected',
    lastError: null,
    scopes: [],
    expiresAt: null,
    config: {},
    secretFields: [],
    metadata: {},
    verifiedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

export function sessionRecord(overrides: Partial<ConnectSession> = {}): ConnectSession {
  return {
    id: 'sess-1',
    state: 'state-1',
    orgId: 'org-1',
    principalId: 'user-1',
    target: 'account',
    kind: KIND,
    appId: null,
    accountId: null,
    inputs: {},
    scopes: ['read'],
    providerState: { step: 'ask' },
    status: 'pending',
    result: null,
    error: null,
    retryAfterSec: null,
    launchToken: null,
    launchHtml: null,
    launchFormHosts: [],
    launchFormFields: [EMAIL_FIELD, ATTEMPTS_FIELD],
    launchUsed: true,
    stateUsed: false,
    resumeCount: 0,
    createdAt: NOW - 10_000,
    expiresAt: NOW + 600_000,
    ...overrides,
  };
}

class StubClock extends ClockPort {
  value = NOW;

  now(): number {
    return this.value;
  }
}

class FlagSessions extends ConnectSessionStorePort {
  private readonly rows: Map<string, ConnectSession>;
  readonly saved: ConnectSession[] = [];

  constructor(session: ConnectSession) {
    super();
    this.rows = new Map([[session.id, session]]);
  }

  create = (session: ConnectSession): void => {
    this.rows.set(session.id, session);
  };

  save = (session: ConnectSession): void => {
    this.rows.set(session.id, session);
    this.saved.push(session);
  };

  findById = (orgId: string, sessionId: string): ConnectSession | null => {
    const session = this.rows.get(sessionId);
    return session && session.orgId === orgId ? session : null;
  };

  findByState = (): ConnectSession | null => null;
  findByLaunchToken = (): ConnectSession | null => null;
  remove = (): boolean => false;
  countLive = (): number => 0;
  sweep = (): void => {};
  watch = (): (() => void) => () => {};
}

class StubRegistry extends ProviderRegistryPort {
  private readonly kinds: Map<string, AccountKindModule>;

  constructor() {
    super();
    this.kinds = new Map([
      [KIND, formKind],
      [NO_RESUME_KIND, noResumeKind],
    ]);
  }

  all = (): readonly ProviderModule[] => [];
  provider = (): ProviderModule | null => null;
  appKind = (): AppKindModule | null => null;
  accountKind = (kind: string): AccountKindModule | null => this.kinds.get(kind) ?? null;
  requireProvider = (): ProviderModule => {
    throw new Error('not used');
  };
  requireAppKind = (): AppKindModule => {
    throw new Error('not used');
  };
  requireAccountKind = (kind: string): AccountKindModule => {
    const outcome = this.kinds.get(kind);
    if (!outcome) {
      throw new Error('not used');
    }
    return outcome;
  };
  providerOfKind = (): ProviderModule => ({
    descriptor: {
      id: PROVIDER_ID,
      label: 'Spec form test',
      description: '',
      iconSvg: null,
      docsUrl: null,
    },
    appKinds: [],
    accountKinds: [],
  });
  catalog = (): CatalogResponse => ({ providers: [] });
}

class StubContext extends ConnectContextPort {
  readonly seen: ConnectResumeCtx[] = [];

  resume = (input: ConnectContextInput): ConnectResumeCtx => {
    const ctx = {
      http: {
        send: () => {
          throw new Error('not used');
        },
      },
      now: () => NOW,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      orgId: input.session.orgId,
      app: null,
      appSecrets: null,
      inputs: input.session.inputs,
      scopes: input.session.scopes,
      existing: input.existing,
      urls: { redirectUri: 'https://api.test/redirect', webhookUrl: null },
      sessionState: input.providerState,
      params: input.params ?? {},
    } satisfies ConnectResumeCtx;
    this.seen.push(ctx);
    return ctx;
  };

  start = (): never => {
    throw new Error('not used');
  };
  poll = (): never => {
    throw new Error('not used');
  };
  appFor = (): AppRecord | null => null;
  existingFor = (): AccountRecord | null => null;
}

class StubFinalizer extends ConnectFinalizePort {
  readonly finalized: FinalizeAccountInput[] = [];

  finalizeApp = (): Promise<AppRecord> => {
    throw new Error('not used');
  };

  finalizeAccount = async (input: FinalizeAccountInput): Promise<AccountRecord> => {
    this.finalized.push(input);
    return accountRecord(input.orgId, input.module.descriptor.kind);
  };
}

class StubUrls extends PublicUrlsPort {
  baseUrl = (): string => 'https://ui.test';
  redirectUri = (): string => 'https://api.test/redirect';
  webhookUrl = (): string => 'https://api.test/webhook';
  launchPageUrl = (token: string): string => `https://ui.test/launch/${token}`;
  callbackPath = (): string => '/connect/callback';
}

class StubMetrics extends MetricsPort {
  readonly counters: Record<string, number> = {};

  increment = (name: string): void => {
    this.counters[name] = (this.counters[name] ?? 0) + 1;
  };

  observe = (): void => {};
}

export function harness(session: ConnectSession) {
  const clock = new StubClock();
  const sessions = new FlagSessions(session);
  const context = new StubContext();
  const finalizer = new StubFinalizer();
  const executor = new ConnectResumeExecutor(
    sessions,
    new StubRegistry(),
    context,
    finalizer,
    new StubUrls(),
    clock,
    new StubMetrics(),
    silentLogger(),
  );
  return {
    useCase: new ResumeFormConnectUseCase(sessions, clock, executor),
    sessions,
    finalizer,
    context,
  };
}
