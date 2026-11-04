import { ConnectorValidationException } from './connector.error.ts';

export function threadKindOfChat(chatType: string): 'chat' | 'group' {
  if (chatType === 'private') {
    return 'chat';
  }
  if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
    return 'group';
  }
  throw new ConnectorValidationException('Telegram supports private chats, groups, and channels');
}
