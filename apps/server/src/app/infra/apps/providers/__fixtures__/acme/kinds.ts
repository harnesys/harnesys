import { ProviderError } from '../../../../../domain/apps/errors.ts';
import type { AccountKindModule } from '../../../../../domain/apps/provider-module.ts';
import { directConnect } from '../../_kit/direct-connect.ts';
import { requireHttp } from '../../_kit/http-classify.ts';
import { hmacSha256, secureCompare } from '../../_kit/signature.ts';
import { header } from './utils.ts';

const PROVIDER_ID = 'acme';
const _API = 'https://api.acme.test';

export const deviceKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-device`,
    provider: PROVIDER_ID,
    label: 'Acme device account',
    description: 'Device code grant with derived access.',
    requiresApp: [],
    inputs: [],
    scopes: { options: [], defaults: [] },
    access: { source: 'derived', keys: ['token'] },
    endpoints: [],
  },
  secrets: ['deviceCode', 'accessToken'],
  egress: { hosts: ['auth.acme.test'] },
  connect: {
    async start() {
      return {
        type: 'wait',
        launch: {
          kind: 'device',
          userCode: 'ACME-1234',
          verificationUri: 'https://auth.acme.test/device',
          intervalSec: 1,
        },
        state: { attempts: 0 },
        ttlSec: 300,
      };
    },
    async resume() {
      throw new ProviderError('invalid_input');
    },
    async poll(ctx) {
      const attempts = Number(ctx.sessionState.attempts ?? 0);
      if (attempts < 1) {
        return { type: 'pending' } as const;
      }
      if (!ctx.scopes.includes('read')) {
        throw new ProviderError('insufficient_scopes');
      }
      return {
        type: 'done',
        result: {
          externalAccountId: 'acme-device-user',
          label: 'Acme device user',
          scopes: ctx.scopes,
          secrets: { deviceCode: 'acme-device-code', accessToken: 'acme-device-token' },
          expiresAt: null,
          metadata: {},
        },
      };
    },
  },
  async verify(ctx) {
    return { identity: { externalAccountId: ctx.account.externalAccountId } };
  },
  access: {
    async resolve(ctx) {
      const deviceCode = await ctx.stored.require('deviceCode');
      return { credentials: { token: `derived-${deviceCode}` }, expiresAt: ctx.now() + 60_000 };
    },
  },
  validateMetadata: () => ({}),
};

export const keyKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-key`,
    provider: PROVIDER_ID,
    label: 'Acme API key',
    description: 'Direct token entry with a generated webhook secret and a user-supplied host.',
    requiresApp: [],
    inputs: [
      { key: 'apiKey', label: 'API key', type: 'secret', required: true },
      {
        key: 'endpoint',
        label: 'Endpoint URL',
        type: 'url',
        required: true,
        placeholder: 'https://shop.myshopify.com',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook secret',
        type: 'secret',
        required: true,
        generated: true,
      },
    ],
    scopes: { options: [], defaults: [] },
    access: { source: 'stored', keys: ['apiKey', 'webhookSecret'] },
    endpoints: ['webhookUrl'],
  },
  secrets: ['apiKey', 'webhookSecret'],
  egress: {
    hosts: [],
    userHost: { field: 'endpoint', allowPrivate: false },
  },
  connect: directConnect(async (ctx) => ({
    externalAccountId: 'acme-key-account',
    label: 'Acme API key',
    scopes: [],
    secrets: {
      apiKey: String(ctx.inputs.apiKey ?? ''),
      webhookSecret: String(ctx.inputs.webhookSecret ?? ''),
    },
    expiresAt: null,
    metadata: {},
  })),
  async verify(ctx) {
    const outcome = requireHttp(
      await ctx.http.send({
        method: 'GET',
        url: `${String(ctx.account.config.endpoint ?? '')}/api/me`,
        headers: { 'x-api-key': ctx.credentials.apiKey ?? '' },
      }),
    );
    if (outcome.status === 401) {
      throw new ProviderError('invalid_credentials');
    }
    return { identity: { externalAccountId: ctx.account.externalAccountId } };
  },
  webhook: {
    async handle(ctx) {
      const secret = await ctx.secrets.require('webhookSecret');
      const supplied = header(ctx.request.headers, 'x-acme-signature') ?? '';
      if (!secureCompare(hmacSha256(ctx.request.body, secret, 'hex'), supplied)) {
        throw new ProviderError('invalid_signature');
      }
      return {
        response: { status: 200 },
        effects: [
          {
            account: { kind: keyKind.descriptor.kind, externalAccountId: 'acme-key-account' },
            status: 'expired' as const,
            error: 'revoked' as const,
          },
        ],
      };
    },
  },
  validateMetadata: () => ({}),
};
