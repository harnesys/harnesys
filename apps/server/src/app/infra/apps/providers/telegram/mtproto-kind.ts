import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  MtprotoClient,
  MtprotoLoginPort,
  MtprotoSignInOutcome,
  MtprotoUserProfile,
} from '../../../../domain/apps/mtproto-port.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  ConnectHandler,
  ProviderCtx,
  SecretReader,
} from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';

const CONNECT_TTL_SEC = 600;

export const telegramAppKind: AppKindModule = {
  descriptor: {
    kind: 'telegram-app',
    provider: 'telegram',
    label: 'Telegram Application',
    description:
      'Application credentials from my.telegram.org (API development tools). Telegram user accounts connect through it.',
    fields: [
      {
        key: 'apiId',
        label: 'App api_id',
        type: 'number',
        required: true,
        editable: true,
        help: 'The numeric api_id issued by API development tools.',
      },
      {
        key: 'apiHash',
        label: 'App api_hash',
        type: 'secret',
        required: true,
        help: 'The api_hash issued next to the api_id.',
      },
    ],
    help: {
      steps: [
        'Open my.telegram.org and sign in with a Telegram account.',
        'Go to API development tools and create an application.',
        'Paste the api_id and api_hash here.',
      ],
      consoleUrl: 'https://my.telegram.org',
    },
    endpoints: [],
  },
  secrets: ['apiHash'],
  egress: { hosts: [] },
  async verify(ctx) {
    const mtproto = requireMtproto(ctx);
    await mtproto.probe(appApiId(ctx.app), await requireApiHash(ctx.secrets));
  },
  validateMetadata: () => ({}),
};

export const telegramUserKind: AccountKindModule = {
  descriptor: {
    kind: 'telegram-user',
    provider: 'telegram',
    label: 'Telegram Account',
    description:
      'A personal Telegram account connected by phone login. The session string is stored as a secret and probed on verify.',
    requiresApp: ['telegram-app'],
    inputs: [
      {
        key: 'phone',
        label: 'Phone number',
        type: 'text',
        required: true,
        pattern: { regex: '^\\+[1-9]\\d{6,14}$', hint: 'E.164 international format' },
      },
    ],
    scopes: { options: [], defaults: [] },
    access: { source: 'stored', keys: ['session'] },
    endpoints: [],
  },
  secrets: ['session'],
  egress: { hosts: [] },
  connect: userConnect(),
  async verify(ctx) {
    const mtproto = requireMtproto(ctx);
    const profile = await mtproto.probeSession({
      apiId: appApiId(ctx.app),
      apiHash: await requireApiHash(ctx.appSecrets),
      session: ctx.credentials.session ?? '',
    });
    return {
      identity: { externalAccountId: profile.userId, label: profileLabel(profile) },
      metadata: profileMetadata(profile),
    };
  },
  validateMetadata: (raw) => pickStrings(raw, ['firstName', 'lastName', 'username']),
};

function userConnect(): ConnectHandler<AccountConnectResult> {
  return {
    async start(ctx) {
      const mtproto = requireMtproto(ctx);
      const apiId = appApiId(ctx.app);
      const apiHash = await requireApiHash(ctx.appSecrets);
      const phone = String(ctx.inputs.phone ?? '');
      const client = mtproto.client({ apiId, apiHash });
      let phoneCodeHash = '';
      let sessionKey = '';
      try {
        await client.connect();
        phoneCodeHash = (await client.sendCode(phone)).phoneCodeHash;
        sessionKey = await client.exportSessionString();
      } finally {
        await client.close();
      }
      return {
        type: 'wait',
        launch: codeForm(phone),
        state: { phone, phoneCodeHash, session: sessionKey },
        ttlSec: CONNECT_TTL_SEC,
      };
    },
    async resume(ctx) {
      const mtproto = requireMtproto(ctx);
      const apiId = appApiId(ctx.app);
      const apiHash = await requireApiHash(ctx.appSecrets);
      const phone = stringState(ctx.sessionState, 'phone');
      const phoneCodeHash = stringState(ctx.sessionState, 'phoneCodeHash');
      const session = stringState(ctx.sessionState, 'session');
      const code = ctx.params.code ?? '';
      const password = ctx.params.password ?? '';
      if (!phone || !session || (!code && !password)) {
        throw new ProviderError('invalid_input');
      }
      const client = mtproto.client({ apiId, apiHash, session });
      try {
        await client.connect();
        const step = await signInStep(client, phone, phoneCodeHash, code, password);
        if (typeof step === 'string') {
          const launch = password ? passwordForm(step) : codeForm(phone, step);
          return {
            type: 'wait',
            launch,
            state: { ...ctx.sessionState },
            ttlSec: CONNECT_TTL_SEC,
          };
        }
        if (step.status === 'needsPassword') {
          const sessionKey = await client.exportSessionString();
          return {
            type: 'wait',
            launch: passwordForm(),
            state: { ...ctx.sessionState, session: sessionKey },
            ttlSec: CONNECT_TTL_SEC,
          };
        }
        const sessionKey = await client.exportSessionString();
        return { type: 'done', result: connectResult(step.profile, sessionKey) };
      } finally {
        await client.close();
      }
    },
  };
}

async function signInStep(
  client: MtprotoClient,
  phone: string,
  phoneCodeHash: string,
  code: string,
  password: string,
): Promise<MtprotoSignInOutcome | string> {
  if (!password) {
    try {
      return await client.signIn(phone, phoneCodeHash, code);
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'invalid_input') {
        return 'The code is rejected or has expired — try again';
      }
      throw error;
    }
  }
  try {
    return await client.signInWithPassword(password);
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'invalid_input') {
      return 'The password is rejected — try again';
    }
    throw error;
  }
}

function codeForm(
  phone: string,
  text = 'Enter the login code Telegram sent you',
): {
  kind: 'form';
  fields: [{ key: 'code'; label: 'Login code'; type: 'text'; required: true; help: string }];
  text: string;
} {
  return {
    kind: 'form',
    fields: [
      {
        key: 'code',
        label: 'Login code',
        type: 'text',
        required: true,
        help: `Sent to the Telegram app for ${phone}`,
      },
    ],
    text,
  };
}

function passwordForm(text = 'Enter the two-factor password for the Telegram account'): {
  kind: 'form';
  fields: [{ key: 'password'; label: '2FA password'; type: 'text'; required: true; help: string }];
  text: string;
} {
  return {
    kind: 'form',
    fields: [
      {
        key: 'password',
        label: '2FA password',
        type: 'text',
        required: true,
        help: 'Cloud password for the Telegram account',
      },
    ],
    text,
  };
}

function requireMtproto(ctx: ProviderCtx): MtprotoLoginPort {
  if (!ctx.mtproto) {
    throw new ProviderError('invalid_response');
  }
  return ctx.mtproto;
}

function appApiId(app: { values: Record<string, unknown> } | null): number {
  const value = app?.values.apiId;
  if (typeof value !== 'number') {
    throw new ProviderError('invalid_input');
  }
  return value;
}

async function requireApiHash(reader: SecretReader | null): Promise<string> {
  if (!reader) {
    throw new ProviderError('invalid_input');
  }
  return reader.require('apiHash');
}

function stringState(state: JsonObject, key: string): string {
  const value = state[key];
  return typeof value === 'string' ? value : '';
}

function connectResult(profile: MtprotoUserProfile, sessionKey: string): AccountConnectResult {
  return {
    externalAccountId: profile.userId,
    label: profileLabel(profile),
    scopes: [],
    secrets: { session: sessionKey },
    expiresAt: null,
    metadata: profileMetadata(profile),
  };
}

function profileLabel(profile: MtprotoUserProfile): string {
  return (
    [profile.firstName, profile.lastName, profile.username].filter(Boolean).join(' ') ||
    'Telegram user'
  );
}

function profileMetadata(profile: MtprotoUserProfile): JsonObject {
  return { firstName: profile.firstName, lastName: profile.lastName, username: profile.username };
}

function pickStrings(raw: JsonObject, keys: readonly string[]): JsonObject {
  const output: JsonObject = {};
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}
