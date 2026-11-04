import { ConnectorValidationException } from './connector.error.ts';

export function threadKindOfChat(chatType: string): 'chat' | 'group' {
  if (chatType === 'private') {
    return 'chat';
  }
  if (chatType === 'group' || chatType === 'supergroup') {
    return 'group';
  }
  throw new ConnectorValidationException('Channels are publish-only; coming in the next phase');
}
