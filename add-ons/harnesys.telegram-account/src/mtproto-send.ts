import * as telegram from 'teleproto';
import { inputPeerOf, type TelegramRawClient } from './mtproto-peer.ts';
import { fieldNumber } from './telegram-entities.ts';
import type {
  AlbumOptions,
  MediaFile,
  ParseMode,
  ResolvedPeer,
  SendMediaOptions,
  SendTextOptions,
} from './telegram-types.ts';

function parseModeOf(mode: ParseMode): 'markdown' | 'html' | false {
  if (mode === 'markdown') {
    return 'markdown';
  }
  if (mode === 'html') {
    return 'html';
  }
  return false;
}

function fileOf(media: MediaFile): telegram.client.uploads.CustomFile {
  return new telegram.client.uploads.CustomFile(media.name, media.data.length, '', media.data);
}

function attributesOf(media: MediaFile): telegram.Api.TypeDocumentAttribute[] | undefined {
  if (media.kind === 'gif') {
    return [new telegram.Api.DocumentAttributeAnimated()];
  }
  return undefined;
}

function messageIdOf(sent: unknown): number {
  return typeof sent === 'object' && sent !== null ? fieldNumber(sent, 'id') : 0;
}

function messageIdsOf(sent: unknown): number[] {
  const list: unknown[] = Array.isArray(sent) ? sent : [sent];
  return list.map(messageIdOf).filter((id) => id > 0);
}

export function createSendMethods(client: TelegramRawClient): {
  sendText(peer: ResolvedPeer, text: string, options: SendTextOptions): Promise<number>;
  sendMedia(peer: ResolvedPeer, media: MediaFile, options: SendMediaOptions): Promise<number>;
  sendAlbum(peer: ResolvedPeer, files: readonly MediaFile[], options: AlbumOptions): Promise<number[]>;
  forward(
    from: ResolvedPeer,
    messageIds: readonly number[],
    to: ResolvedPeer,
    options: { dropAuthor: boolean; silent: boolean },
  ): Promise<number[]>;
  editText(
    peer: ResolvedPeer,
    messageId: number,
    text: string,
    parseMode: ParseMode,
  ): Promise<void>;
  deleteMessages(peer: ResolvedPeer, messageIds: readonly number[], revoke: boolean): Promise<void>;
  pinMessage(peer: ResolvedPeer, messageId: number, notify: boolean): Promise<void>;
  unpinMessage(peer: ResolvedPeer, messageId?: number): Promise<void>;
  react(peer: ResolvedPeer, messageId: number, emoji: string): Promise<void>;
} {
  return {
    async sendText(peer, text, options) {
      const sent = await client.sendMessage(inputPeerOf(peer), {
        message: text,
        parseMode: parseModeOf(options.parseMode),
        replyTo: options.replyTo,
        silent: options.silent,
        schedule: options.scheduleAt,
      });
      return messageIdOf(sent);
    },
    async sendMedia(peer, media, options) {
      const sent = await client.sendFile(inputPeerOf(peer), {
        file: fileOf(media),
        caption: media.caption ?? '',
        parseMode: parseModeOf(options.parseMode),
        replyTo: options.replyTo,
        silent: options.silent,
        scheduleDate: options.scheduleAt,
        forceDocument: options.forceDocument,
        attributes: attributesOf(media),
        voiceNote: media.kind === 'voice',
      });
      return messageIdOf(sent);
    },
    async sendAlbum(peer, files, options) {
      const sent = await client.sendFile(inputPeerOf(peer), {
        file: files.map(fileOf),
        caption: files.map((media) => media.caption ?? ''),
        parseMode: parseModeOf(options.parseMode),
        replyTo: options.replyTo,
        silent: options.silent,
        scheduleDate: options.scheduleAt,
      });
      return messageIdsOf(sent);
    },
    async forward(from, messageIds, to, options) {
      const sent = await client.forwardMessages(inputPeerOf(to), {
        messages: [...messageIds],
        fromPeer: inputPeerOf(from),
        dropAuthor: options.dropAuthor,
        silent: options.silent,
      });
      return sent.map(messageIdOf).filter((id) => id > 0);
    },
    async editText(peer, messageId, text, parseMode) {
      await client.editMessage(inputPeerOf(peer), {
        message: messageId,
        text,
        parseMode: parseModeOf(parseMode),
      });
    },
    async deleteMessages(peer, messageIds, revoke) {
      await client.deleteMessages(inputPeerOf(peer), [...messageIds], { revoke });
    },
    async pinMessage(peer, messageId, notify) {
      await client.pinMessage(inputPeerOf(peer), messageId, { notify });
    },
    async unpinMessage(peer, messageId) {
      await client.unpinMessage(inputPeerOf(peer), messageId);
    },
    async react(peer, messageId, emoji) {
      const reaction =
        emoji.length === 0 ? [] : [new telegram.Api.ReactionEmoji({ emoticon: emoji })];
      await client.sendReaction(inputPeerOf(peer), messageId, reaction);
    },
  };
}