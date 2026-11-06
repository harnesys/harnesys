export interface RawTelegramPost {
  id: number;
  date: number;
  text: string;
  topicId: number | null;
  mediaName?: string;
  senderName: string | null;
}

export interface NormalizedPost {
  postId: number;
  topicId: number | null;
  authorTitle: string | null;
  text: string;
  mediaKinds: string[];
  publishedAt: string;
}

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

export function mediaKindOf(name: string | undefined): string | null {
  if (!name) {
    return null;
  }
  return MEDIA_KINDS[name] ?? name;
}

export function normalizePost(raw: RawTelegramPost): NormalizedPost {
  const kind = mediaKindOf(raw.mediaName);
  return {
    postId: raw.id,
    topicId: raw.topicId,
    authorTitle: raw.senderName,
    text: raw.text,
    mediaKinds: kind === null ? [] : [kind],
    publishedAt: new Date(raw.date * 1000).toISOString(),
  };
}
