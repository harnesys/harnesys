import { Injectable } from '@harnesys/brix';
import type {
  AccountKindDescriptor,
  AppKindDescriptor,
} from '../../../../domain/apps/app-kind.port.ts';
import { AppKindProviderPort } from '../../../../domain/apps/app-kind.port.ts';

@Injectable()
export class GoogleAppKindProviderAdapter extends AppKindProviderPort {
  descriptor(): AppKindDescriptor {
    return {
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
    };
  }

  accountKinds(): AccountKindDescriptor[] {
    return [
      {
        kind: 'google-account',
        label: 'Google account',
        description:
          'Google account authorized against a workspace Google Cloud project, holding the grant tokens addons use to call Google APIs.',
        fields: [
          {
            key: 'refreshToken',
            label: 'Refresh token',
            secret: true,
            required: true,
            multiline: false,
            placeholder: '',
          },
          {
            key: 'accessToken',
            label: 'Access token',
            secret: true,
            required: false,
            multiline: false,
            placeholder: '',
          },
        ],
      },
    ];
  }
}
