import { loadThreadAttachment, loadThreadFileContent } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { downloadContentEntry } from '@/shared/api/content';
import { FileTypeIcon } from '@/shared/ui/icons';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

function isImageFile(name: string, mediaType?: string): boolean {
  if (mediaType?.startsWith('image/')) {
    return true;
  }
  const base = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  return IMAGE_EXTS.has(ext);
}

type BlobLoader = (signal: AbortSignal) => Promise<Blob>;

export function RowLeading({
  name,
  mediaType,
  threadId,
  attachmentId,
  path,
  orgId,
  sourceId,
  worktreeId,
}: {
  name: string;
  mediaType?: string;
  threadId?: string;
  attachmentId?: string;
  path?: string;
  orgId?: string;
  sourceId?: string;
  worktreeId?: string;
}) {
  const image = isImageFile(name, mediaType);
  const load = image ? resolveLoader() : null;
  const url = useAuthedBlobUrl(load, `${attachmentId ?? path ?? name}:${image}`);
  if (image && url.url) {
    return (
      <img
        src={url.url}
        alt=""
        className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-border/40"
      />
    );
  }
  return <FileTypeIcon name={name} mediaType={mediaType} size="xl" />;

  function resolveLoader(): BlobLoader | null {
    if (threadId && attachmentId) {
      return (signal) => loadThreadAttachment(threadId, attachmentId, signal);
    }
    if (threadId && path) {
      return (signal) => loadThreadFileContent(threadId, path, signal);
    }
    if (orgId && sourceId && path) {
      return () => downloadContentEntry(orgId, sourceId, path, worktreeId);
    }
    return null;
  }
}
