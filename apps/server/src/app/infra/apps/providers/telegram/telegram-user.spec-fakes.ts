import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  MtprotoApiAccess,
  MtprotoClient,
  MtprotoPhoneCode,
  MtprotoSignInOutcome,
  MtprotoUserProfile,
} from '../../../../domain/apps/mtproto-port.ts';
import { MtprotoLoginPort } from '../../../../domain/apps/mtproto-port.ts';
import type {
  AccountVerifyCtx,
  AppVerifyCtx,
  ConnectResumeCtx,
  ConnectStartCtx,
  ProviderLogger,
  SecretReader,
} from '../../../../domain/apps/provider-module.ts';
import type { AccountRecord, AppRecord, JsonObject } from '../../../../domain/apps/records.ts';

export const API_ID = 12345;
export const API_HASH = 'hash-1';
export const PHONE = '+15551234567';
export const STATIC_SESSION = 'static-session';
export const EXPORTED_SESSION = 'exported-session';
export const PROFILE: MtprotoUserProfile = {
  userId: '9001',
  firstName: 'First',
  lastName: 'Last',
  username: 'handle',
};

export interface TelegramFakeScript {
  sendCodeHash?: string;
  signIn?: MtprotoSignInOutcome | (() => Promise<MtprotoSignInOutcome>);
  signInWithPassword?: (password: string) => Promise<MtprotoSignInOutcome>;
  exported?: string;
  probe?: number;
  probeProfile?: MtprotoUserProfile;
}

class FakeClient implements MtprotoClient {
  connected = false;
  closed = false;

  constructor(
    readonly access: MtprotoApiAccess,
    private readonly script: TelegramFakeScript,
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async sendCode(phone: string): Promise<MtprotoPhoneCode> {
    if (phone !== PHONE) {
      throw new Error(`unexpected phone ${phone}`);
    }
    return { phoneCodeHash: this.script.sendCodeHash ?? '' };
  }

  async signIn(phone: string, phoneCodeHash: string, code: string): Promise<MtprotoSignInOutcome> {
    if (phone !== PHONE || phoneCodeHash === '' || code === '') {
      throw new Error('unexpected signIn arguments');
    }
    const step = this.script.signIn;
    if (typeof step === 'function') {
      return step();
    }
    if (!step) {
      throw new Error('signIn not scripted');
    }
    return step;
  }

  async signInWithPassword(password: string): Promise<MtprotoSignInOutcome> {
    const step =
      this.script.signInWithPassword ?? (() => Promise.reject(new Error('not scripted')));
    return step(password);
  }

  async me(): Promise<MtprotoUserProfile> {
    return PROFILE;
  }

  async exportSessionString(): Promise<string> {
    return this.script.exported ?? EXPORTED_SESSION;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export class FakeMtprotoPort extends MtprotoLoginPort {
  readonly clients: FakeClient[] = [];
  readonly probeCalls: { apiId: number; apiHash: string }[] = [];
  readonly probeSessionCalls: { apiId: number; apiHash: string; session: string }[] = [];

  constructor(private readonly script: TelegramFakeScript) {
    super();
  }

  override client(access: MtprotoApiAccess): MtprotoClient {
    const client = new FakeClient(access, this.script);
    this.clients.push(client);
    return client;
  }

  override async probe(apiId: number, apiHash: string): Promise<number> {
    this.probeCalls.push({ apiId, apiHash });
    return this.script.probe ?? 1;
  }

  override async probeSession(api: MtprotoApiAccess): Promise<MtprotoUserProfile> {
    this.probeSessionCalls.push({
      apiId: api.apiId,
      apiHash: api.apiHash,
      session: api.session ?? '',
    });
    if (!this.script.probeProfile) {
      throw new Error('probeProfile not scripted');
    }
    return this.script.probeProfile;
  }
}

export function startCtx(port: MtprotoLoginPort): ConnectStartCtx {
  return {
    http: {
      async send() {
        throw new ProviderError('provider_unavailable');
      },
    },
    now: () => 1,
    log: silentLog(),
    mtproto: port,
    orgId: 'org-1',
    app: appRecord(),
    appSecrets: reader({ apiHash: API_HASH }),
    inputs: { phone: PHONE },
    scopes: [],
    existing: null,
    urls: { redirectUri: 'https://api.test/redirect', webhookUrl: null },
    state: 'state-1',
  };
}

export function resumeCtx(
  port: MtprotoLoginPort,
  sessionState: JsonObject,
  params: Record<string, string>,
): ConnectResumeCtx {
  return {
    ...startCtx(port),
    sessionState,
    params,
  };
}

export function appVerifyCtx(port: MtprotoLoginPort): AppVerifyCtx {
  return {
    http: {
      async send() {
        throw new ProviderError('provider_unavailable');
      },
    },
    now: () => 1,
    log: silentLog(),
    mtproto: port,
    app: appRecord(),
    secrets: reader({ apiHash: API_HASH }),
  };
}

export function verifyCtx(port: MtprotoLoginPort): AccountVerifyCtx {
  return {
    http: {
      async send() {
        throw new ProviderError('provider_unavailable');
      },
    },
    now: () => 1,
    log: silentLog(),
    mtproto: port,
    account: accountRecord(),
    app: appRecord(),
    appSecrets: reader({ apiHash: API_HASH }),
    credentials: { session: STATIC_SESSION },
  };
}

function accountRecord(): AccountRecord {
  return {
    id: 'acc-1',
    orgId: 'org-1',
    appId: 'app-1',
    kind: 'telegram-user',
    externalAccountId: '9001',
    partition: '',
    label: 'First Last handle',
    status: 'connected',
    lastError: null,
    scopes: [],
    expiresAt: null,
    config: {},
    secretFields: ['session'],
    metadata: {},
    verifiedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function appRecord(): AppRecord {
  return {
    id: 'app-1',
    orgId: 'org-1',
    kind: 'telegram-app',
    label: 'Telegram app',
    status: 'configured',
    lastError: null,
    values: { apiId: API_ID },
    secretFields: ['apiHash'],
    metadata: {},
    verifiedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function reader(values: Record<string, string>): SecretReader {
  return {
    async get(key) {
      return values[key] ?? null;
    },
    async require(key) {
      const value = values[key];
      if (value === undefined) {
        throw new ProviderError('invalid_credentials');
      }
      return value;
    },
  };
}

function silentLog(): ProviderLogger {
  return { info() {}, warn() {}, error() {} };
}
