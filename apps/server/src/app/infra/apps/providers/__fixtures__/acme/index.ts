import { ProviderError } from '../../../../../domain/apps/errors.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  AppSetupResult,
  ConnectHandler,
  WebhookCtx,
} from '../../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../../domain/apps/records.ts';
import { defineProvider } from '../../_kit/define.ts';
import { directConnect } from '../../_kit/direct-connect.ts';
import { secureCompare } from '../../_kit/signature.ts';
import { deviceKind, keyKind } from './kinds.ts';
import { header, parseBody } from './utils.ts';

const PROVIDER_ID = 'acme';
const OAUTH = {
  authorizeUrl: 'https://auth.acme.test/authorize',
  tokenUrl: 'https://auth.acme.test/token',
};
const _API = 'https://api.acme.test';

const appKind: AppKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-app`,
    provider: PROVIDER_ID,
    label: 'Acme app',
    description: 'Fixture app registration that covers the setup path.',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      {
        key: 'signingSecret',
        label: 'Signing secret',
        type: 'secret',
        required: true,
        generated: true,
      },
    ],
    help: { steps: ['Nothing to do for the fixture.'], consoleUrl: null },
    endpoints: ['redirectUri', 'webhookUrl'],
  },
  secrets: ['signingSecret'],
  egress: { hosts: ['api.acme.test', 'auth.acme.test'] },
  setup: directConnect(
    async (ctx): Promise<AppSetupResult> => ({
      label: 'Acme app',
      values: { clientId: String(ctx.inputs.clientId ?? '') },
      secrets: { signingSecret: String(ctx.inputs.signingSecret ?? '') },
      metadata: {},
    }),
  ),
  async verify(ctx) {
    if (String(ctx.app.values.clientId ?? '') === '') {
      throw new ProviderError('invalid_credentials');
    }
  },
  webhook: {
    async handle(ctx: WebhookCtx) {
      const parsed = parseBody(ctx.request.body);
      if (parsed?.type === 'challenge' && typeof parsed.challenge === 'string') {
        return {
          response: {
            status: 200,
            body: parsed.challenge,
            contentType: 'text/plain',
          },
        };
      }
      const signingSecret = await ctx.secrets.require('signingSecret');
      const supplied = header(ctx.request.headers, 'x-acme-signature') ?? '';
      if (!secureCompare(signingSecret, supplied)) {
        throw new ProviderError('invalid_signature');
      }
      return {
        response: { status: 200 },
        events: [
          {
            type: 'acme.app.event',
            deliveryId: String(parsed?.id ?? ''),
            occurredAt: ctx.now(),
            payload: (parsed ?? {}) as JsonObject,
          },
        ],
      };
    },
  },
  validateMetadata: () => ({}),
};

const oauthConnect: ConnectHandler<AccountConnectResult> = {
  async start(ctx) {
    const url = new URL(OAUTH.authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', String(ctx.app?.values.clientId ?? ''));
    url.searchParams.set('redirect_uri', ctx.urls.redirectUri);
    url.searchParams.set('state', ctx.state);
    url.searchParams.set('scope', ctx.scopes.join(' '));
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set(
      'code_challenge',
      typeof ctx.state === 'string' ? ctx.state.slice(0, 43) : 'challenge',
    );
    url.searchParams.set('code_challenge_method', 'S256');
    return {
      type: 'wait',
      launch: { kind: 'redirect', url: url.toString() },
      state: { workspace: ctx.inputs.workspace ?? 'personal' },
      ttlSec: 600,
    };
  },
  async resume(ctx) {
    if (ctx.params.error) {
      throw new ProviderError('denied');
    }
    if (!ctx.params.code) {
      throw new ProviderError('invalid_input');
    }
    const workspace = String(ctx.sessionState.workspace ?? 'personal');
    return {
      type: 'done',
      result: {
        externalAccountId: `acme-user-${workspace}`,
        label: `Acme ${workspace}`,
        partition: workspace,
        scopes: ctx.scopes,
        secrets: {
          accessToken: 'acme-access-1',
          refreshToken: 'acme-refresh-1',
        },
        expiresAt: ctx.now() + 600_000,
        metadata: { workspace },
      },
    };
  },
};

const oauthKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-oauth`,
    provider: PROVIDER_ID,
    label: 'Acme OAuth account',
    description: 'OAuth grant with refresh rotation.',
    requiresApp: [`${PROVIDER_ID}-app`],
    inputs: [
      {
        key: 'workspace',
        label: 'Workspace',
        type: 'select',
        required: true,
        default: 'personal',
        options: [
          { value: 'personal', label: 'Personal' },
          { value: 'team', label: 'Team' },
        ],
      },
    ],
    scopes: {
      options: [
        { key: 'read', label: 'Read' },
        { key: 'write', label: 'Write' },
      ],
      defaults: ['read'],
    },
    access: { source: 'stored', keys: ['accessToken'] },
    endpoints: [],
  },
  secrets: ['accessToken', 'refreshToken'],
  egress: { hosts: ['auth.acme.test', 'api.acme.test'] },
  connect: oauthConnect,
  async verify(ctx) {
    const workspace = String(ctx.account.config.workspace ?? 'personal');
    return {
      identity: { externalAccountId: `acme-user-${workspace}` },
      metadata: { workspace },
    };
  },
  access: {
    async resolve(ctx) {
      const refreshToken = await ctx.stored.require('refreshToken');
      return {
        credentials: { accessToken: 'acme-access-2' },
        expiresAt: ctx.now() + 600_000,
        persist: { secrets: { accessToken: 'acme-access-2', refreshToken } },
      };
    },
  },
  async revoke() {
    return;
  },
  validateMetadata: (raw) => {
    const output: JsonObject = {};
    if (raw.workspace === 'personal' || raw.workspace === 'team') {
      output.workspace = raw.workspace;
    }
    return output;
  },
};

export function acmeProvider() {
  return defineProvider({
    descriptor: {
      id: PROVIDER_ID,
      label: 'Acme',
      description: 'Test provider that exercises every core path.',
      iconSvg: null,
      docsUrl: null,
    },
    appKinds: [appKind],
    accountKinds: [oauthKind, deviceKind, keyKind],
  });
}
