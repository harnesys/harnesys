import { AddonError } from '@harnesys/sdk';
import { defaultExtension, type OutgoingMediaKind } from './media-kind.ts';
import { messageOf, type TelegramRawClient } from './mtproto-peer.ts';
import {
  field,
  mediaMimeTypeOf,
  mediaNameOf,
  mediaSizeOf,
  messageMediaKindOf,
} from './telegram-entities.ts';
import type { DownloadedMedia, ResolvedPeer } from './telegram-types.ts';

const MEDIA_KIND_NAMES: Record<string, OutgoingMediaKind> = {
  photo: 'photo',
  video: 'video',
  voice: 'voice',
  audio: 'audio',
  animation: 'gif',
};

function outKindOf(mediaKind: string | null): OutgoingMediaKind {
  if (mediaKind === null) {
    return 'document';
  }
  return MEDIA_KIND_NAMES[mediaKind] ?? 'document';
}

function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

export function createMediaMethods(client: TelegramRawClient): {
  download(peer: ResolvedPeer, messageId: number, maxBytes: number): Promise<DownloadedMedia>;
} {
  return {
    async download(peer, messageId, maxBytes) {
      const message = await messageOf(client, peer, messageId);
      const entity = message as object;
      if (field(entity, 'media') === undefined || field(entity, 'media') === null) {
        throw new AddonError('invalid_params', {
          detail: `message ${messageId} has no media to download`,
        });
      }
      const declared = mediaSizeOf(entity);
      if (declared !== null && declared > maxBytes) {
        throw new AddonError('invalid_params', {
          detail: `media is ${megabytes(declared)} MB, above the ${megabytes(maxBytes)} MB cap; raise max_download_mb or download it in another client`,
        });
      }
      const downloaded = await client.downloadMedia(message);
      if (!Buffer.isBuffer(downloaded)) {
        throw new AddonError('internal', {
          detail: `telegram returned no bytes for message ${messageId}`,
        });
      }
      if (downloaded.length > maxBytes) {
        throw new AddonError('invalid_params', {
          detail: `media is ${megabytes(downloaded.length)} MB, above the ${megabytes(maxBytes)} MB cap; raise max_download_mb`,
        });
      }
      const mediaKind = messageMediaKindOf(entity);
      const kind = outKindOf(mediaKind);
      return {
        data: downloaded,
        mimeType: mediaMimeTypeOf(entity) ?? 'application/octet-stream',
        fileName: mediaNameOf(entity) ?? `file.${defaultExtension(kind)}`,
        mediaKind,
        size: downloaded.length,
      };
    },
  };
}
