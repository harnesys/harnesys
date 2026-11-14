import type {
  ChatEntry,
  DialogEntry,
  MessageDetail,
  PeerKind,
  RawPost,
  ResolvedPeer,
} from './telegram-types.ts';

const MEDIA_KINDS: Record<string, string> = {
  MessageMediaPhoto: 'photo',
  MessageMediaDocument: 'document',
  MessageMediaVideo: 'video',
  MessageMediaVoice: 'voice',
  MessageMediaAudio: 'audio',
  MessageMediaAnimation: 'animation',
  MessageMediaSticker: 'sticker',
  MessageMediaPoll: 'poll',
  MessageMediaDice: 'dice',
  MessageMediaWebPage: 'web-page',
  MessageMediaContact: 'contact',
  MessageMediaGeo: 'location',
};

export function field(entity: object, key: string): unknown {
  return (entity as Record<string, unknown>)[key];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(typeof value === 'object' ? String(value) : value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fieldString(entity: object, key: string): string | null {
  const value = field(entity, key);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return String((value as { toString(): string }).toString());
  }
  return String(value);
}

export function fieldNumber(entity: object, key: string): number {
  return Number(field(entity, key) ?? 0);
}

function kindOf(entity: object): PeerKind {
  const className = fieldString(entity, 'className');
  if (className === 'User') {
    return 'user';
  }
  if (className === 'Chat') {
    return 'group';
  }
  if (field(entity, 'broadcast') === true) {
    return 'channel';
  }
  if (field(entity, 'megagroup') === true) {
    return 'supergroup';
  }
  if (className === 'Channel') {
    return 'channel';
  }
  return fieldString(entity, 'firstName') !== null || fieldString(entity, 'lastName') !== null
    ? 'user'
    : 'group';
}

function titleOf(entity: object): string {
  const title = fieldString(entity, 'title');
  if (title) {
    return title;
  }
  const names = [fieldString(entity, 'firstName'), fieldString(entity, 'lastName')].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  return names.join(' ') || 'Untitled';
}

export function toResolved(entity: object): ResolvedPeer {
  return {
    peerId: fieldString(entity, 'id') ?? '',
    accessHash: fieldString(entity, 'accessHash') ?? '',
    username: fieldString(entity, 'username'),
    title: titleOf(entity),
    kind: kindOf(entity),
    joined: field(entity, 'left') !== true,
  };
}

function mediaKindOf(message: object): string | null {
  const media = field(message, 'media');
  const inner = typeof media === 'object' && media !== null ? field(media, 'media') : null;
  if (typeof inner !== 'object' || inner === null) {
    return null;
  }
  const name = fieldString(inner, 'className');
  if (name === null) {
    return null;
  }
  return MEDIA_KINDS[name] ?? name;
}

export function messageMediaKindOf(message: object): string | null {
  return mediaKindOf(message);
}

export function mediaSizeOf(message: object): number | null {
  const file = field(message, 'file');
  if (typeof file !== 'object' || file === null) {
    return null;
  }
  return numberOrNull(field(file, 'size'));
}

export function mediaNameOf(message: object): string | null {
  const file = field(message, 'file');
  if (typeof file !== 'object' || file === null) {
    return null;
  }
  const name = field(file, 'name');
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function mediaMimeTypeOf(message: object): string | null {
  const file = field(message, 'file');
  if (typeof file !== 'object' || file === null) {
    return null;
  }
  return fieldString(file, 'mimeType');
}

export function displayNameOf(entity: object): string {
  const username = fieldString(entity, 'username');
  const title = fieldString(entity, 'title');
  const names = [fieldString(entity, 'firstName'), fieldString(entity, 'lastName')].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  const full = names.join(' ');
  if (full.length > 0) {
    return full;
  }
  if (title !== null && title.length > 0) {
    return title;
  }
  return username ?? (fieldString(entity, 'id') ?? '');
}

export function toRaw(message: object): RawPost {
  const replyTo = field(message, 'replyTo');
  const rawTopic =
    typeof replyTo === 'object' && replyTo !== null ? fieldString(replyTo, 'forumTopicId') : null;
  const text = fieldString(message, 'text') ?? fieldString(message, 'message') ?? '';
  return {
    postId: fieldNumber(message, 'id'),
    text,
    publishedAt: new Date(fieldNumber(message, 'date') * 1000).toISOString(),
    topicId: rawTopic === null ? null : Number(rawTopic),
    mediaKind: mediaKindOf(message),
  };
}

function senderOf(message: object): string | null {
  const sender = field(message, 'sender');
  if (typeof sender === 'object' && sender !== null) {
    const username = fieldString(sender, 'username');
    const title = fieldString(sender, 'title');
    const first = fieldString(sender, 'firstName');
    const last = fieldString(sender, 'lastName');
    const name = [first, last]
      .filter((part): part is string => part !== null && part !== '')
      .join(' ');
    const label = username === null ? (title ?? name) : `@${username}`;
    if (label.length > 0) {
      return label;
    }
    return fieldString(sender, 'id');
  }
  return fieldString(message, 'senderId');
}

export function toChatEntry(message: object): ChatEntry {
  return {
    id: fieldNumber(message, 'id'),
    date: new Date(fieldNumber(message, 'date') * 1000).toISOString(),
    sender: senderOf(message),
    text: fieldString(message, 'message') ?? '',
    mediaKind: mediaKindOf(message),
  };
}

export interface MessageDetailLinks {
  peerId: string | null;
  forwardFrom: string | null;
}

function isoAt(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export function toMessageDetail(message: object, links: MessageDetailLinks): MessageDetail {
  const replyTo = field(message, 'replyTo');
  const edited = numberOrNull(field(message, 'editDate'));
  return {
    id: fieldNumber(message, 'id'),
    peerId: links.peerId,
    date: isoAt(fieldNumber(message, 'date')),
    sender: senderOf(message),
    text: fieldString(message, 'message') ?? fieldString(message, 'text') ?? '',
    mediaKind: mediaKindOf(message),
    mediaSize: mediaSizeOf(message),
    replyToMessageId:
      typeof replyTo === 'object' && replyTo !== null
        ? numberOrNull(field(replyTo, 'replyToMsgId'))
        : null,
    forwardFrom: links.forwardFrom,
    views: numberOrNull(field(message, 'views')),
    editedAt: edited === null ? null : isoAt(edited),
  };
}

export function toDialog(dialog: object): DialogEntry {
  const entity = field(dialog, 'entity');
  const source = typeof entity === 'object' && entity !== null ? entity : null;
  let kind: PeerKind = 'channel';
  if (source === null) {
    kind = field(dialog, 'isUser') === true ? 'user' : 'channel';
  } else {
    kind = kindOf(source);
  }
  return {
    kind,
    peerId: fieldString(dialog, 'id') ?? (source === null ? '' : (fieldString(source, 'id') ?? '')),
    username: source === null ? null : fieldString(source, 'username'),
    title: fieldString(dialog, 'title') ?? (source === null ? '' : titleOf(source)),
    unread: fieldNumber(dialog, 'unreadCount'),
  };
}
