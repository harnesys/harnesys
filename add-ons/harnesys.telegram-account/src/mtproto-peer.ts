import { AddonError } from '@harnesys/sdk';
import bigInt from 'big-integer';
import * as telegram from 'teleproto';
import { field } from './telegram-entities.ts';
import type { ResolvedPeer } from './telegram-types.ts';

export type TelegramRawClient = telegram.TelegramClient;

export function inputPeerOf(peer: ResolvedPeer): telegram.Api.TypeInputPeer {
  if (peer.kind === 'user') {
    return new telegram.Api.InputPeerUser({
      userId: bigInt(peer.peerId || '0'),
      accessHash: bigInt(peer.accessHash || '0'),
    });
  }
  if (peer.kind === 'group') {
    return new telegram.Api.InputPeerChat({ chatId: bigInt(peer.peerId || '0') });
  }
  return new telegram.Api.InputPeerChannel({
    channelId: bigInt(peer.peerId || '0'),
    accessHash: bigInt(peer.accessHash || '0'),
  });
}

export function inputChannelOf(peer: ResolvedPeer): telegram.Api.TypeInputChannel {
  return telegram.utils.getInputChannel(inputPeerOf(peer));
}

export function inputUserOf(peer: ResolvedPeer): telegram.Api.TypeInputUser {
  return telegram.utils.getInputUser(inputPeerOf(peer));
}

export function chatIdOf(peer: ResolvedPeer): bigInt.BigInteger {
  return bigInt(peer.peerId || '0');
}

export async function messageOf(
  client: TelegramRawClient,
  peer: ResolvedPeer,
  messageId: number,
): Promise<telegram.Api.Message> {
  const messages = await client.getMessages(inputPeerOf(peer), { ids: messageId });
  const first = messages[0];
  if (!(first instanceof telegram.Api.Message)) {
    throw new AddonError('not_found', {
      detail: `message ${messageId} is not in ${peer.title}`,
    });
  }
  return first;
}

export function markedPeerIdOf(message: object): string | null {
  try {
    const peer = field(message, 'peerId');
    return peer === undefined || peer === null ? null : telegram.utils.getPeerId(peer);
  } catch {
    return null;
  }
}

export function forwardNameOf(message: object): string | null {
  const forwarded = field(message, 'fwdFrom');
  if (typeof forwarded !== 'object' || forwarded === null) {
    return null;
  }
  const fromName = field(forwarded, 'fromName');
  if (typeof fromName === 'string' && fromName.length > 0) {
    return fromName;
  }
  const from = field(forwarded, 'fromId');
  if (typeof from !== 'object' || from === null) {
    return null;
  }
  try {
    return telegram.utils.getPeerId(from);
  } catch {
    return null;
  }
}