import { Inject, Injectable, Logger } from '@harnesys/brix';
import { MtprotoLoginPort } from '../../../domain/apps/mtproto-port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type {
  AccountKindModule,
  AppKindModule,
  ConnectPollCtx,
  ConnectResumeCtx,
  ConnectStartCtx,
  ProviderHttp,
  SecretReader,
} from '../../../domain/apps/provider-module.ts';
import type {
  AccountRecord,
  AppRecord,
  ConnectSession,
  JsonObject,
} from '../../../domain/apps/records.ts';
import { createdProviderLogger } from '../shared/provider-context.ts';
import { ConnectContextPort } from './connect-context.port.ts';

type KindModule = AppKindModule | AccountKindModule;

export interface ConnectContextInput {
  session: ConnectSession;
  module: KindModule;
  app: AppRecord | null;
  appModule: AppKindModule | null;
  existing: AccountRecord | null;
  providerState: JsonObject;
  params?: Record<string, string>;
}

@Injectable()
export class ConnectContextFactory extends ConnectContextPort {
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly mtproto: MtprotoLoginPort,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('apps-connect');
  }

  override start(input: ConnectContextInput, state: string): ConnectStartCtx {
    return {
      ...this.base(input),
      state,
    };
  }

  override resume(input: ConnectContextInput): ConnectResumeCtx {
    return {
      ...this.base(input),
      sessionState: input.providerState,
      params: input.params ?? {},
    };
  }

  override poll(input: ConnectContextInput): ConnectPollCtx {
    return {
      ...this.base(input),
      sessionState: input.providerState,
    };
  }

  override appFor(session: ConnectSession): AppRecord | null {
    return session.appId ? this.apps.findById(session.orgId, session.appId) : null;
  }

  override existingFor(session: ConnectSession): AccountRecord | null {
    return session.accountId ? this.accounts.findById(session.orgId, session.accountId) : null;
  }

  private base(input: ConnectContextInput) {
    const userHostField = input.module.egress.userHost?.field;
    const userHostValue = userHostField
      ? (input.session.inputs[userHostField] ??
        input.existing?.config[userHostField] ??
        input.app?.values[userHostField])
      : undefined;
    return {
      http: this.httpFor(input.module, userHostValue),
      now: () => this.clock.now(),
      log: createdProviderLogger(this.logger, secretValuesOf(input.module, input.session.inputs)),
      mtproto: this.mtproto,
      orgId: input.session.orgId,
      app: input.app,
      appSecrets: this.appSecrets(input.session.orgId, input.app, input.appModule),
      inputs: input.session.inputs,
      scopes: input.session.scopes,
      existing: input.existing,
      urls: {
        redirectUri: this.urls.redirectUri(input.session.orgId),
        webhookUrl:
          input.module.descriptor.endpoints.includes('webhookUrl') &&
          ((input.session.target === 'app' && input.session.appId) ||
            (input.session.target === 'account' && input.session.accountId))
            ? this.urls.webhookUrl(input.session.orgId, targetOf(input.session))
            : null,
      },
    };
  }

  private httpFor(module: KindModule, userHost: unknown): ProviderHttp {
    return this.http.create(module.egress, userHost === undefined ? null : String(userHost));
  }

  private appSecrets(
    orgId: string,
    app: AppRecord | null,
    appModule: AppKindModule | null,
  ): SecretReader | null {
    return app && appModule
      ? this.secrets.reader(orgId, { type: 'app', id: app.id }, appModule.secrets)
      : null;
  }
}

function secretValuesOf(module: KindModule, inputs: Record<string, unknown>): string[] {
  const fields =
    'inputs' in module.descriptor ? module.descriptor.inputs : module.descriptor.fields;
  return fields
    .filter((field) => field.type === 'secret' || field.generated === true)
    .map((field) => (inputs[field.key] === undefined ? '' : String(inputs[field.key])))
    .filter((value) => value.length > 0);
}

export function targetOf(session: Pick<ConnectSession, 'target' | 'appId' | 'accountId'>) {
  if (session.target === 'app' && session.appId) {
    return { type: 'app' as const, id: session.appId };
  }
  return { type: 'account' as const, id: session.accountId ?? '' };
}
