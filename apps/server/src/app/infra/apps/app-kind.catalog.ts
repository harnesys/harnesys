import type { AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';

export const BUILTIN_APP_KINDS: AppKindDescriptor[] = [
  {
    kind: 'google-cloud-project',
    label: 'Google Cloud project',
    description:
      'OAuth client used to authorize Google accounts. One project per workspace shares the client between every Google addon.',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        secret: false,
        required: true,
        multiline: false,
        placeholder: '1234567890-abc.apps.googleusercontent.com',
      },
      {
        key: 'clientSecret',
        label: 'Client secret',
        secret: true,
        required: true,
        multiline: false,
        placeholder: '',
      },
      {
        key: 'apiKey',
        label: 'API key',
        secret: true,
        required: false,
        multiline: false,
        placeholder: '',
      },
      {
        key: 'appId',
        label: 'Project number',
        secret: false,
        required: false,
        multiline: false,
        placeholder: '1234567890',
      },
    ],
  },
  {
    kind: 'github-app',
    label: 'GitHub App',
    description:
      'GitHub App registration used to mint installation tokens for repositories, issues, pull requests, and CI.',
    fields: [
      {
        key: 'appId',
        label: 'App ID',
        secret: false,
        required: true,
        multiline: false,
        placeholder: '123456',
      },
      {
        key: 'slug',
        label: 'App slug',
        secret: false,
        required: false,
        multiline: false,
        placeholder: 'harnesys',
      },
      {
        key: 'privateKey',
        label: 'Private key',
        secret: true,
        required: true,
        multiline: true,
        placeholder: '-----BEGIN RSA PRIVATE KEY-----',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook secret',
        secret: true,
        required: false,
        multiline: false,
        placeholder: '',
      },
      {
        key: 'clientId',
        label: 'OAuth client ID',
        secret: false,
        required: false,
        multiline: false,
        placeholder: '',
      },
      {
        key: 'clientSecret',
        label: 'OAuth client secret',
        secret: true,
        required: false,
        multiline: false,
        placeholder: '',
      },
    ],
  },
  {
    kind: 'telegram-mtproto',
    label: 'Telegram MTProto app',
    description:
      'api_id and api_hash from my.telegram.org, shared by every Telegram user account connected to this workspace.',
    fields: [
      {
        key: 'apiId',
        label: 'API ID',
        secret: false,
        required: true,
        multiline: false,
        placeholder: '1234567',
      },
      {
        key: 'apiHash',
        label: 'API hash',
        secret: true,
        required: true,
        multiline: false,
        placeholder: '0123456789abcdef0123456789abcdef',
      },
    ],
  },
];
