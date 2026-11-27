import { parseImageArtifact as parseImageToolArtifact } from '@harnesys/studio-shared';
import type { ToolEventPair } from '@/entities/session';
import { openFile } from '@/features/ide';
import { blobContentBackend, type FileRef, fileRefKey } from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { AttachmentTile } from '@/shared/ui/attachment-tile';

export interface ImageArtifactInfo {
  key: string;
  ref: FileRef;
  name: string;
}

export function parseImageArtifact(
  pair: ToolEventPair,
  threadId?: string,
): ImageArtifactInfo | null {
  const artifact = parseImageToolArtifact({
    phase: pair.result?.phase,
    output: pair.result?.output,
  });
  if (!artifact || !threadId) {
    return null;
  }
  const ref: FileRef = {
    source: 'thread-attachment',
    threadId,
    attachmentId: artifact.attachmentId,
    name: artifact.name,
    mediaType: artifact.mediaType,
  };
  return { key: fileRefKey(ref), ref, name: artifact.name };
}

export function ImageArtifact({ fileRef, name }: { fileRef: FileRef; name: string }) {
  const backend = blobContentBackend(fileRef);
  const { url, error } = useAuthedBlobUrl(backend.load, backend.key);
  return (
    <AttachmentTile
      name={name}
      mediaType="image/*"
      thumb={url}
      href={url ?? undefined}
      load={backend.load}
      onOpen={() => openFile(fileRef)}
      failed={Boolean(error)}
    />
  );
}
