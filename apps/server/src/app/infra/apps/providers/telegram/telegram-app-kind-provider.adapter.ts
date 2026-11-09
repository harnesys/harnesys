import { Injectable } from '@harnesys/brix';
import type {
  AccountKindDescriptor,
  AppKindDescriptor,
} from '../../../../domain/apps/app-kind.port.ts';
import { AppKindProviderPort } from '../../../../domain/apps/app-kind.port.ts';

@Injectable()
export class TelegramAppKindProviderAdapter extends AppKindProviderPort {
  descriptor(): AppKindDescriptor {
    return {
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
    };
  }

  accountKinds(): AccountKindDescriptor[] {
    return [
      {
        kind: 'telegram-bot',
        label: 'Telegram bot',
        description:
          'Bot issued by @BotFather. The bot token is the identity, so no application is attached to the account.',
        fields: [
          {
            key: 'botToken',
            label: 'Bot token',
            secret: true,
            required: true,
            multiline: false,
            placeholder: '123456789:AA...',
          },
        ],
      },
    ];
  }
}
