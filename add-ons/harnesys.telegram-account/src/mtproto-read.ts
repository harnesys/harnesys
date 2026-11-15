import * as telegram from 'teleproto';
import {
  chatIdOf,
  inputChannelOf,
  inputPeerOf,
  inputUserOf,
  markedPeerIdOf,
  messageOf,
  type TelegramRawClient,
} from './mtproto-peer.ts';
import { displayNameOf, field, fieldString, toMessageDetail } from './telegram-entities.ts';
import type {
  ChatInfo,
  MessageDetail,
  ParticipantEntry,
  ParticipantQuery,
  ResolvedPeer,
  TopicEntry,
} from './telegram-types.ts';

const ADMIN_CLASSES = new Set([
  'ChannelParticipantAdmin',
  'ChannelParticipantCreator',
  'ChatParticipantAdmin',
  'ChatParticipantCreator',
]);

function isAdminParticipant(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const className = fieldString(value, 'className');
  return className !== null && ADMIN_CLASSES.has(className);
}

function participantOf(user: telegram.UserWithParticipant): ParticipantEntry {
  const entity = user as object;
  return {
    id: fieldString(entity, 'id') ?? '',
    username: fieldString(entity, 'username'),
    title: displayNameOf(entity),
    isBot: field(entity, 'bot') === true,
    isAdmin: isAdminParticipant(field(entity, 'participant')),
  };
}

function baseInfo(peer: ResolvedPeer): ChatInfo {
  return {
    title: peer.title,
    kind: peer.kind,
    username: peer.username,
    about: null,
    participantsCount: null,
    isMember: peer.joined,
    pinnedMessageId: null,
    slowmodeSeconds: null,
  };
}

function withUserDetail(info: ChatInfo, full: unknown): ChatInfo {
  if (!(full instanceof telegram.Api.UserFull)) {
    return info;
  }
  return {
    ...info,
    about: full.about ?? null,
    pinnedMessageId: full.pinnedMsgId ?? null,
  };
}

function withChatDetail(info: ChatInfo, full: unknown): ChatInfo {
  if (!(full instanceof telegram.Api.ChatFull)) {
    return info;
  }
  const participants = full.participants;
  return {
    ...info,
    about: full.about ?? null,
    participantsCount:
      participants instanceof telegram.Api.ChatParticipants
        ? participants.participants.length
        : null,
    pinnedMessageId: full.pinnedMsgId ?? null,
  };
}

function withChannelDetail(info: ChatInfo, full: unknown): ChatInfo {
  if (!(full instanceof telegram.Api.ChannelFull)) {
    return info;
  }
  return {
    ...info,
    about: full.about ?? null,
    participantsCount: full.participantsCount ?? null,
    pinnedMessageId: full.pinnedMsgId ?? null,
    slowmodeSeconds: full.slowmodeSeconds ?? null,
  };
}

function topicIdOf(updates: telegram.Api.TypeUpdates): number {
  if (
    !(updates instanceof telegram.Api.Updates) &&
    !(updates instanceof telegram.Api.UpdatesCombined)
  ) {
    return 0;
  }
  for (const update of updates.updates) {
    if (!(update instanceof telegram.Api.UpdateNewChannelMessage)) {
      continue;
    }
    const message = update.message;
    if (
      message instanceof telegram.Api.Message &&
      message.action instanceof telegram.Api.MessageActionTopicCreate
    ) {
      return message.id;
    }
  }
  return 0;
}

export function createReadMethods(client: TelegramRawClient): {
  message(peer: ResolvedPeer, messageId: number): Promise<MessageDetail>;
  search(query: string, peer: ResolvedPeer | undefined, limit: number): Promise<MessageDetail[]>;
  chatInfo(peer: ResolvedPeer): Promise<ChatInfo>;
  participants(peer: ResolvedPeer, query: ParticipantQuery): Promise<ParticipantEntry[]>;
  topics(peer: ResolvedPeer, limit: number): Promise<TopicEntry[]>;
  createTopic(peer: ResolvedPeer, title: string): Promise<number>;
} {
  return {
    async message(peer, messageId) {
      const message = await messageOf(client, peer, messageId);
      const entity = message as object;
      return toMessageDetail(entity, { peerId: markedPeerIdOf(entity), forwardFrom: null });
    },
    async search(query, peer, limit) {
      const entity = peer === undefined ? undefined : inputPeerOf(peer);
      const messages = await client.getMessages(entity, { search: query, limit });
      return messages.map((message) => {
        const raw = message as object;
        return toMessageDetail(raw, { peerId: markedPeerIdOf(raw), forwardFrom: null });
      });
    },
    async chatInfo(peer) {
      const info = baseInfo(peer);
      if (peer.kind === 'user') {
        const full = await client.invoke(
          new telegram.Api.users.GetFullUser({ id: inputUserOf(peer) }),
        );
        return withUserDetail(info, full.fullUser);
      }
      if (peer.kind === 'group') {
        const full = await client.invoke(
          new telegram.Api.messages.GetFullChat({ chatId: chatIdOf(peer) }),
        );
        return withChatDetail(info, full.fullChat);
      }
      const full = await client.invoke(
        new telegram.Api.channels.GetFullChannel({ channel: inputChannelOf(peer) }),
      );
      return withChannelDetail(info, full.fullChat);
    },
    async participants(peer, query) {
      const adminsFilter =
        query.adminsOnly && peer.kind !== 'group'
          ? new telegram.Api.ChannelParticipantsAdmins()
          : undefined;
      const users = await client.getParticipants(inputPeerOf(peer), {
        limit: query.limit,
        ...(query.search === undefined ? {} : { search: query.search }),
        ...(adminsFilter === undefined ? {} : { filter: adminsFilter }),
      });
      const filtered =
        query.adminsOnly && peer.kind === 'group'
          ? users.filter((user) => isAdminParticipant(field(user as object, 'participant')))
          : [...users];
      return filtered.map((user) => participantOf(user));
    },
    async topics(peer, limit) {
      const result = await client.getForumTopics(inputPeerOf(peer), { limit });
      return result.topics
        .filter(
          (topic): topic is telegram.Api.ForumTopic => topic instanceof telegram.Api.ForumTopic,
        )
        .map((topic) => ({
          id: topic.id,
          title: topic.title,
          closed: topic.closed === true,
          pinned: topic.pinned === true,
          unread: topic.unreadCount ?? 0,
        }));
    },
    async createTopic(peer, title) {
      const updates = await client.createForumTopic(inputPeerOf(peer), { title });
      return topicIdOf(updates);
    },
  };
}
