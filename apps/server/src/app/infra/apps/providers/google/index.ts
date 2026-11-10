import { ProviderError } from '../../../../domain/apps/errors.ts';
import type {
  AccountConnectResult,
  AccountKindModule,
  AppKindModule,
  ConnectHandler,
  ProviderHttp,
} from '../../../../domain/apps/provider-module.ts';
import type { JsonObject } from '../../../../domain/apps/records.ts';
import { defineProvider } from '../_kit/define.ts';
import { requireHttp } from '../_kit/http-classify.ts';
import { buildAuthorizeUrl, exchangeCode, refreshAccessToken } from '../_kit/oauth2.ts';
import { createPkce } from '../_kit/pkce.ts';
import { toProviderScopes } from '../_kit/scopes.ts';

const PROVIDER_ID = 'google';
const OAUTH = {
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
};

const SCOPE_MAP: Record<string, string> = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  'gmail-readonly': 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar',
  drive: 'https://www.googleapis.com/auth/drive',
  youtube: 'https://www.googleapis.com/auth/youtube',
};

const SCOPES = [
  { key: 'openid', label: 'OpenID', description: 'Sign-in identity token' },
  { key: 'email', label: 'Email address', description: 'Primary email address' },
  { key: 'profile', label: 'Profile', description: 'Name and picture' },
  { key: 'gmail-readonly', label: 'Gmail (read)', description: 'Read messages and threads' },
  { key: 'calendar', label: 'Calendar', description: 'Read and write calendars' },
  { key: 'drive', label: 'Drive', description: 'Files in Google Drive' },
  { key: 'youtube', label: 'YouTube', description: 'YouTube channel data' },
];

const appKind: AppKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-oauth-client`,
    provider: PROVIDER_ID,
    label: 'Google OAuth client',
    description:
      'OAuth client of a Google Cloud project. Every Google account connects through it.',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        placeholder: '1234567890-abc.apps.googleusercontent.com',
      },
      {
        key: 'clientSecret',
        label: 'Client secret',
        type: 'secret',
        required: true,
      },
      {
        key: 'projectId',
        label: 'Project ID',
        type: 'text',
        required: false,
        editable: true,
        help: 'Shown for operators; not used by the OAuth flow.',
      },
    ],
    help: {
      steps: [
        'Open Google Cloud Console and create or select a project.',
        'Enable the APIs the addon needs (Gmail, Calendar, Drive).',
        'Configure the OAuth consent screen with the scopes you plan to request.',
        'Create an OAuth client of type Web application and register the redirect URI below.',
        'Paste the client ID and client secret here.',
      ],
      consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    },
    endpoints: ['redirectUri'],
  },
  secrets: ['clientSecret'],
  egress: {
    hosts: ['oauth2.googleapis.com', 'www.googleapis.com', 'accounts.google.com'],
  },
  validateMetadata: (raw) => pick(raw, ['projectId']),
};

const connect: ConnectHandler<AccountConnectResult> = {
  async start(ctx) {
    const clientId = String(ctx.app?.values.clientId ?? '');
    if (!clientId) {
      throw new ProviderError('invalid_credentials');
    }
    const pkce = createPkce();
    const url = buildAuthorizeUrl({
      endpoints: OAUTH,
      clientId,
      redirectUri: ctx.urls.redirectUri,
      scopes: toProviderScopes(ctx.scopes, SCOPE_MAP),
      state: ctx.state,
      codeChallenge: pkce.challenge,
      extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    });
    return {
      type: 'wait',
      launch: { kind: 'redirect', url },
      state: { verifier: pkce.verifier, scopes: ctx.scopes },
      ttlSec: 600,
    };
  },
  async resume(ctx) {
    const code = ctx.params.code;
    if (!code) {
      throw new ProviderError(ctx.params.error === 'access_denied' ? 'denied' : 'invalid_input');
    }
    const clientId = String(ctx.app?.values.clientId ?? '');
    if (!ctx.appSecrets) {
      throw new ProviderError('invalid_credentials');
    }
    const clientSecret = await ctx.appSecrets.require('clientSecret');
    const verifier = typeof ctx.sessionState.verifier === 'string' ? ctx.sessionState.verifier : '';
    const token = await exchangeCode(
      ctx.http,
      {
        endpoints: OAUTH,
        clientId,
        clientSecret,
        code,
        redirectUri: ctx.urls.redirectUri,
        codeVerifier: verifier,
      },
      ctx.now(),
    );
    const profile = await fetchProfile(ctx.http, token.accessToken);
    const granted = Array.isArray(ctx.sessionState.scopes)
      ? ctx.sessionState.scopes.filter((scope): scope is string => typeof scope === 'string')
      : [];
    const partition = granted.includes('youtube') ? 'youtube' : '';
    if (!token.refreshToken && !ctx.existing?.secretFields.includes('refreshToken')) {
      throw new ProviderError('invalid_response');
    }
    const secrets: Record<string, string> = { accessToken: token.accessToken };
    if (token.refreshToken) {
      secrets.refreshToken = token.refreshToken;
    }
    return {
      type: 'done',
      result: {
        externalAccountId: profile.id,
        label: profile.email || profile.name || profile.id,
        partition,
        scopes: granted,
        secrets,
        expiresAt: token.expiresAt,
        metadata: { email: profile.email },
      },
    };
  },
};

const accountKind: AccountKindModule = {
  descriptor: {
    kind: `${PROVIDER_ID}-account`,
    provider: PROVIDER_ID,
    label: 'Google account',
    description:
      'Google account authorized through the workspace OAuth client. YouTube grants are kept apart from Workspace grants.',
    requiresApp: [`${PROVIDER_ID}-oauth-client`],
    inputs: [],
    scopes: {
      options: SCOPES,
      defaults: ['openid', 'email', 'profile'],
    },
    access: { source: 'stored', keys: ['accessToken'] },
    endpoints: [],
  },
  secrets: ['accessToken', 'refreshToken'],
  egress: {
    hosts: ['oauth2.googleapis.com', 'www.googleapis.com'],
  },
  connect,
  async verify(ctx) {
    const profile = await fetchProfile(ctx.http, ctx.credentials.accessToken ?? '');
    return {
      identity: { externalAccountId: profile.id, label: profile.email },
      metadata: { email: profile.email },
    };
  },
  access: {
    async resolve(ctx) {
      const refreshToken = await ctx.stored.get('refreshToken');
      const clientId = String(ctx.app?.values.clientId ?? '');
      if (!refreshToken || !clientId || !ctx.appSecrets) {
        throw new ProviderError('invalid_credentials');
      }
      const clientSecret = await ctx.appSecrets.require('clientSecret');
      const token = await refreshAccessToken(
        ctx.http,
        { endpoints: OAUTH, clientId, clientSecret, refreshToken },
        ctx.now(),
      );
      return {
        credentials: { accessToken: token.accessToken },
        expiresAt: token.expiresAt,
        persist: {
          secrets: {
            accessToken: token.accessToken,
            ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
          },
        },
      };
    },
  },
  async revoke(ctx) {
    const refreshToken = await ctx.stored.get('refreshToken');
    if (!refreshToken) {
      return;
    }
    await ctx.http.send({
      method: 'POST',
      url: `${OAUTH.revokeUrl}?token=${encodeURIComponent(refreshToken)}`,
    });
  },
  validateMetadata: (raw) => pick(raw, ['email']),
};

interface GoogleProfile {
  id: string;
  email: string;
  name: string;
}

async function fetchProfile(http: ProviderHttp, accessToken: string): Promise<GoogleProfile> {
  const outcome = requireHttp(
    await http.send({
      method: 'GET',
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  if (outcome.status < 200 || outcome.status >= 300 || !outcome.json) {
    throw new ProviderError(outcome.status === 401 ? 'invalid_credentials' : 'invalid_response');
  }
  const record = outcome.json as Record<string, unknown>;
  if (typeof record.id !== 'string') {
    throw new ProviderError('invalid_response');
  }
  return {
    id: record.id,
    email: typeof record.email === 'string' ? record.email : '',
    name: typeof record.name === 'string' ? record.name : '',
  };
}

function pick(raw: JsonObject, keys: string[]): JsonObject {
  const output: JsonObject = {};
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}

export const googleProvider = defineProvider({
  descriptor: {
    id: PROVIDER_ID,
    label: 'Google',
    description: 'Google Workspace and consumer accounts through OAuth 2.0.',
    iconSvg: null,
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2',
  },
  appKinds: [appKind],
  accountKinds: [accountKind],
});
