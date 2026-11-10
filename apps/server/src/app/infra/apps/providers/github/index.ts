import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  AppSetupResult,
  ConnectHandler,
  ConnectResumeCtx,
} from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';

import { defineProvider } from '../_kit/define.ts';
import { requireHttp } from '../_kit/http-classify.ts';
import { signAppJwt } from '../_kit/jwt.ts';
import { hmacSha256, secureCompare } from '../_kit/signature.ts';
import {
  asJsonObject,
  githubEventType,
  installationEffects,
  installationRef,
  lowerHeader,
  manifestPage,
  parseBody,
  publicHookUrl,
} from './support.ts';

const PROVIDER_ID = 'github';
const API = 'https://api.github.com';

const setup: ConnectHandler<AppSetupResult> = {
  async start(ctx) {
    const hookUrl = publicHookUrl(ctx.urls.webhookUrl);
    const manifest = {
      name: `Harnesys ${ctx.orgId.slice(0, 8)}`,
      url: 'https://github.com',
      redirect_url: ctx.urls.redirectUri,
      setup_url: ctx.urls.redirectUri,
      ...(hookUrl ? { hook_attributes: { url: hookUrl, active: true } } : {}),
      public: false,
      default_permissions: { contents: 'read', metadata: 'read', issues: 'write' },
    };
    return {
      type: 'wait',
      launch: {
        kind: 'html',
        html: manifestPage(ctx.state, manifest),
        formActionHosts: ['github.com'],
      },
      state: {},
      ttlSec: 900,
    };
  },
  async resume(ctx) {
    const code = ctx.params.code;
    if (!code) {
      throw new ProviderError('invalid_input');
    }
    const outcome = requireHttp(
      await ctx.http.send({
        method: 'POST',
        url: `${API}/app-manifests/${encodeURIComponent(code)}/conversions`,
        headers: { accept: 'application/vnd.github+json' },
      }),
    );
    if (outcome.status === 404) {
      throw new ProviderError('invalid_input');
    }
    if (!outcome.json) {
      throw new ProviderError('invalid_response');
    }
    const record = outcome.json as Record<string, unknown>;
    if (typeof record.id !== 'number' || typeof record.pem !== 'string') {
      throw new ProviderError('invalid_response');
    }
    const secrets: Record<string, string> = { privateKey: record.pem };
    if (typeof record.webhook_secret === 'string') {
      secrets.webhookSecret = record.webhook_secret;
    }
    if (typeof record.client_secret === 'string') {
      secrets.clientSecret = record.client_secret;
    }
    return {
      type: 'done',
      result: {
        label: typeof record.name === 'string' ? record.name : `GitHub App ${record.id}`,
        values: {
          appId: String(record.id),
          slug: typeof record.slug === 'string' ? record.slug : '',
          clientId: typeof record.client_id === 'string' ? record.client_id : '',
        },
        secrets,
        metadata: {},
      },
    };
  },
};

const appKind: AppKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-app`,
    provider: PROVIDER_ID,
    label: 'GitHub App',
    description:
      'GitHub App registration with its private key and webhook secret. Installations connect as accounts.',
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', required: true },
      { key: 'slug', label: 'App slug', type: 'text', required: true },
      { key: 'privateKey', label: 'Private key (PEM)', type: 'secret', required: true },
      { key: 'webhookSecret', label: 'Webhook secret', type: 'secret', required: false },
      { key: 'clientId', label: 'Client ID', type: 'text', required: false, editable: true },
      { key: 'clientSecret', label: 'Client secret', type: 'secret', required: false },
    ],
    help: {
      steps: [
        'Let Harnesys create the GitHub App automatically, or create one manually in GitHub settings.',
        'Register the redirect URI and webhook URL shown here on the App, and set the Setup URL to the same redirect URI.',
        'Grant the permissions the addon needs and install the App on an organization or repositories.',
      ],
      consoleUrl: 'https://github.com/settings/apps',
    },
    endpoints: ['redirectUri', 'webhookUrl'],
  },
  secrets: ['privateKey', 'webhookSecret', 'clientSecret'],
  egress: { hosts: ['api.github.com', 'github.com'] },
  setup,
  webhook: {
    async handle(ctx) {
      if (ctx.target.type !== 'app') {
        throw new ProviderError('invalid_input');
      }
      const secret = await ctx.secrets.require('webhookSecret');
      const supplied = lowerHeader(ctx.request.headers, 'x-hub-signature-256') ?? '';
      const expected = `sha256=${hmacSha256(ctx.request.body, secret, 'hex')}`;
      if (!secureCompare(expected, supplied)) {
        throw new ProviderError('invalid_signature');
      }
      const parsed = parseBody(ctx.request.body);
      const deliveryId = lowerHeader(ctx.request.headers, 'x-github-delivery') ?? '';
      if (!parsed || !deliveryId) {
        throw new ProviderError('invalid_input');
      }
      const effects = installationEffects(parsed);
      const accountRef = installationRef(parsed);
      return {
        response: { status: 200 },
        events: [
          {
            type: githubEventType(parsed),
            deliveryId,
            occurredAt: ctx.now(),
            payload: asJsonObject(parsed),
            ...(accountRef ? { account: accountRef } : {}),
          },
        ],
        ...(effects.length > 0 ? { effects } : {}),
      };
    },
  },
  validateMetadata: () => ({}),
};

const connect: ConnectHandler<AccountConnectResult> = {
  async start(ctx) {
    const slug = String(ctx.app?.values.slug ?? '');
    if (!slug) {
      throw new ProviderError('invalid_credentials');
    }
    return {
      type: 'wait',
      launch: {
        kind: 'redirect',
        url: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(ctx.state)}`,
      },
      state: {},
      ttlSec: 900,
    };
  },
  async resume(ctx) {
    const installationId = ctx.params.installation_id;
    if (!installationId) {
      throw new ProviderError(ctx.params.setup_action === 'cancelled' ? 'denied' : 'invalid_input');
    }
    const installation = await fetchInstallation(ctx, installationId);
    return {
      type: 'done',
      result: {
        externalAccountId: String(installation.id),
        label: installation.login,
        scopes: [],
        secrets: {},
        expiresAt: null,
        metadata: { installationId: installation.id },
      },
    };
  },
};

const accountKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-installation`,
    provider: PROVIDER_ID,
    label: 'GitHub installation',
    description:
      'Installation of the GitHub App on an account. Tokens are issued from the App private key on demand.',
    requiresApp: [`${PROVIDER_ID}-app`],
    inputs: [],
    scopes: { options: [], defaults: [] },
    access: { source: 'derived', keys: ['token'] },
    endpoints: [],
  },
  secrets: [],
  egress: { hosts: ['api.github.com'] },
  connect,
  async verify(ctx) {
    const installationId = installationIdOf(ctx.account.metadata);
    const outcome = requireHttp(
      await ctx.http.send({
        method: 'GET',
        url: `${API}/installation/repositories`,
        headers: authHeader(ctx.credentials.token ?? ''),
      }),
    );
    if (outcome.status === 401) {
      throw new ProviderError('invalid_credentials');
    }
    if (outcome.status === 403) {
      throw new ProviderError('insufficient_scopes');
    }
    if (outcome.status < 200 || outcome.status >= 300) {
      throw new ProviderError(outcome.status === 404 ? 'not_found' : 'provider_unavailable');
    }
    return {
      identity: { externalAccountId: String(installationId) },
      metadata: { installationId },
    };
  },
  access: {
    async resolve(ctx) {
      const installationId = installationIdOf(ctx.account.metadata);
      const appJwt = await appJwtOf(ctx);
      const outcome = requireHttp(
        await ctx.http.send({
          method: 'POST',
          url: `${API}/app/installations/${installationId}/access_tokens`,
          headers: { ...authHeader(appJwt), accept: 'application/vnd.github+json' },
        }),
      );
      if (outcome.status === 401 || outcome.status === 404) {
        throw new ProviderError('invalid_credentials');
      }
      if (!outcome.json) {
        throw new ProviderError('invalid_response');
      }
      const record = outcome.json as Record<string, unknown>;
      if (typeof record.token !== 'string') {
        throw new ProviderError('invalid_response');
      }
      return {
        credentials: { token: record.token },
        expiresAt:
          typeof record.expires_at === 'string'
            ? Date.parse(record.expires_at)
            : ctx.now() + 3_600_000,
      };
    },
  },
  async revoke() {
    return;
  },
  validateMetadata: (raw) => {
    const output: JsonObject = {};
    if (typeof raw.installationId === 'number') {
      output.installationId = raw.installationId;
    }
    return output;
  },
};

interface GithubInstallation {
  id: number;
  login: string;
}

async function fetchInstallation(
  ctx: ConnectResumeCtx,
  installationId: string,
): Promise<GithubInstallation> {
  const appJwt = await appJwtOf(ctx);
  const outcome = requireHttp(
    await ctx.http.send({
      method: 'GET',
      url: `${API}/app/installations/${encodeURIComponent(installationId)}`,
      headers: { ...authHeader(appJwt), accept: 'application/vnd.github+json' },
    }),
  );
  if (outcome.status === 404) {
    throw new ProviderError('not_found');
  }
  if (!outcome.json) {
    throw new ProviderError('invalid_response');
  }
  const record = outcome.json as Record<string, unknown>;
  if (typeof record.id !== 'number') {
    throw new ProviderError('invalid_response');
  }
  const account = record.account as Record<string, unknown> | undefined;
  return {
    id: record.id,
    login: typeof account?.login === 'string' ? account.login : `installation ${record.id}`,
  };
}

async function appJwtOf(ctx: {
  now(): number;
  app: { values: Record<string, unknown> } | null;
  appSecrets: { require(key: string): Promise<string> } | null;
}): Promise<string> {
  const appId = String(ctx.app?.values.appId ?? '');
  if (!appId || !ctx.appSecrets) {
    throw new ProviderError('invalid_credentials');
  }
  const privateKey = await ctx.appSecrets.require('privateKey');
  return signAppJwt({ appId, privateKeyPem: privateKey, now: ctx.now() });
}

function installationIdOf(metadata: JsonObject): number {
  return typeof metadata.installationId === 'number' ? metadata.installationId : 0;
}

function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
export const githubProvider = defineProvider({
  descriptor: {
    id: PROVIDER_ID,
    label: 'GitHub',
    description: 'GitHub Apps and their installations.',
    iconSvg: null,
    docsUrl: 'https://docs.github.com/en/apps',
  },
  appKinds: [appKind],
  accountKinds: [accountKind],
});
