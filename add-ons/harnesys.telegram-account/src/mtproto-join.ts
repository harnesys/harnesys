import * as telegram from 'teleproto';
import { chatIdOf, inputPeerOf, type TelegramRawClient } from './mtproto-peer.ts';
import { toResolved } from './telegram-entities.ts';
import type { ResolvedPeer } from './telegram-types.ts';

function chatsOf(updates: telegram.Api.TypeUpdates): telegram.Api.TypeChat[] {
  if (updates instanceof telegram.Api.Updates || updates instanceof telegram.Api.UpdatesCombined) {
    return [...updates.chats];
  }
  return [];
}

function joinedChatOf(result: telegram.Api.messages.TypeChatInviteJoinResult): ResolvedPeer | null {
  const updates =
    result instanceof telegram.Api.messages.ChatInviteJoinResultOk ? result.updates : null;
  const chat = updates === null ? undefined : chatsOf(updates)[0];
  if (chat === undefined) {
    return null;
  }
  const resolved = toResolved(chat);
  return resolved.peerId.length === 0 ? null : resolved;
}

export function createJoinMethods(client: TelegramRawClient): {
  join(peer: ResolvedPeer): Promise<void>;
  joinInvite(link: string): Promise<ResolvedPeer | null>;
  leave(peer: ResolvedPeer): Promise<void>;
} {
  return {
    async join(peer) {
      await client.joinChannel(inputPeerOf(peer));
    },
    async joinInvite(link) {
      return joinedChatOf(await client.importChatInvite(link));
    },
    async leave(peer) {
      if (peer.kind === 'group') {
        await client.invoke(
          new telegram.Api.messages.DeleteChatUser({
            chatId: chatIdOf(peer),
            userId: new telegram.Api.InputUserSelf(),
          }),
        );
        return;
      }
      await client.leaveChannel(inputPeerOf(peer));
    },
  };
}
