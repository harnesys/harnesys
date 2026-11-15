import type { ToolHandler } from '@harnesys/sdk';
import { chatLabelOf, chatRefOf } from './chat-target.ts';
import { joinTargetOf } from './join-target.ts';
import { assertSendAllowed, recordSend } from './send-log.ts';
import { assertJoinAllowed, peerOf, requireWritable } from './tool-access.ts';
import { withSharedClient } from './tool-client.ts';
import { withFloodRetry } from './tool-errors.ts';
import { requiredChat, requiredString } from './tool-params.ts';
import { toolSettings } from './tool-settings.ts';

const MAX_TOPIC_TITLE = 128;

const joinChatTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'join_chat');
  assertJoinAllowed(settings, 'join_chat');
  const target = joinTargetOf(input.link);
  await assertSendAllowed(ctx, settings.limits, target.label, new Date());
  const joined = await withSharedClient(ctx, async (client) => {
    if (target.kind === 'invite') {
      const peer = await withFloodRetry(settings.limits.floodWaitRetries, () =>
        client.joinInvite(target.link),
      );
      return peer === null
        ? { title: null, kind: null, peerId: null }
        : { title: peer.title, kind: peer.kind, peerId: peer.peerId };
    }
    const peer = await client.resolve(target.username);
    await withFloodRetry(settings.limits.floodWaitRetries, () => client.join(peer));
    return { title: peer.title, kind: peer.kind, peerId: peer.peerId };
  });
  await recordSend(ctx, target.label, new Date());
  return {
    link: target.label,
    chat: joined.title ?? target.label,
    kind: joined.kind,
    peerId: joined.peerId,
    joined: true,
  };
};

const leaveChatTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'leave_chat');
  assertJoinAllowed(settings, 'leave_chat');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    await withFloodRetry(settings.limits.floodWaitRetries, () => client.leave(peer));
    return { chat: chatLabelOf(ref), title: peer.title, left: true };
  });
};

const createTopicTool: ToolHandler = async (input, ctx) => {
  const settings = await toolSettings(ctx);
  requireWritable(settings, 'create_topic');
  const ref = chatRefOf(requiredChat(input, 'chat'));
  const title = requiredString(input, 'title', MAX_TOPIC_TITLE);
  return withSharedClient(ctx, async (client) => {
    const peer = await peerOf(client, settings, ref);
    const topicId = await withFloodRetry(settings.limits.floodWaitRetries, () =>
      client.createTopic(peer, title),
    );
    return { chat: chatLabelOf(ref), title, topicId, created: topicId > 0 };
  });
};

export const chatTools: Record<string, ToolHandler> = {
  join_chat: joinChatTool,
  leave_chat: leaveChatTool,
  create_topic: createTopicTool,
};
