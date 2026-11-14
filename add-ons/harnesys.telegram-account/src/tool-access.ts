import { AddonError } from '@harnesys/sdk';
import { type ChatRef, chatLabelOf, matchesAllowed, resolveArgOf } from './chat-target.ts';
import type { AccountToolSettings } from './tool-settings.ts';
import type { FeedClient, ResolvedPeer } from './telegram-types.ts';

export function requireWritable(settings: AccountToolSettings, tool: string): void {
  if (settings.readOnly) {
    throw new AddonError('permission_denied', {
      detail: `${tool} is disabled because read_only is on for this add-on; turn Read-only off to write from the account`,
    });
  }
}

export function assertJoinAllowed(settings: AccountToolSettings, tool: string): void {
  if (!settings.joinAllowed) {
    throw new AddonError('permission_denied', {
      detail: `${tool} is disabled because join_allowed is off for this add-on; turn it on to let the account join or leave chats`,
    });
  }
}

export async function peerOf(
  client: FeedClient,
  settings: AccountToolSettings,
  ref: ChatRef,
): Promise<ResolvedPeer> {
  const peer = await client.resolve(resolveArgOf(ref));
  const allowed = matchesAllowed(settings.allowedChats, ref, {
    peerId: peer.peerId,
    username: peer.username,
  });
  if (!allowed) {
    throw new AddonError('permission_denied', {
      detail: `${chatLabelOf(ref)} is not in allowed_chats (${settings.allowedChats.join(', ')}); an id and its @username are the same grant, so either spelling works when one of them is listed`,
    });
  }
  return peer;
}