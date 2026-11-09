import { Injectable } from '@harnesys/brix';
import type {
  AccountKindDescriptor,
  AppKindDescriptor,
} from '../../../../domain/apps/app-kind.port.ts';
import { AppKindProviderPort } from '../../../../domain/apps/app-kind.port.ts';

@Injectable()
export class GithubAppKindProviderAdapter extends AppKindProviderPort {
  descriptor(): AppKindDescriptor {
    return {
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
    };
  }

  accountKinds(): AccountKindDescriptor[] {
    return [
      {
        kind: 'github-installation',
        label: 'GitHub installation',
        description:
          'Installation of the workspace GitHub App on an account or organization. The installation id is the identity and access tokens are minted on demand.',
        fields: [],
      },
    ];
  }
}
