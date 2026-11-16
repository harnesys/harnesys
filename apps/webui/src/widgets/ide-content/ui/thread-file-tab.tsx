import { openFileKind } from '@/features/open-file';
import { loadThreadAttachment, loadThreadFileContent } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { attachmentPreviewKind, FilePreview, type FilePreviewKind } from '@/widgets/file-pane';
import { PreviewHint } from '@/widgets/ide-content/ui/preview-hint';

export function ThreadFileTabContent({
  threadId,
  path,
  attachmentId,
  mediaType,
}: {
  threadId: string;
  path: string;
  attachmentId?: string;
  mediaType?: string;
}) {
  const kind: FilePreviewKind = attachmentId
    ? attachmentPreviewKind(path, mediaType ?? '')
    : openFileKind(path);
  const name = path.split('/').pop() || path;
  const { url, error } = useAuthedBlobUrl(
    () =>
      attachmentId
        ? loadThreadAttachment(threadId, attachmentId)
        : loadThreadFileContent(threadId, path),
    `${threadId}:${attachmentId ?? path}`,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread-file">
      {error ? <PreviewHint text="Could not load file." /> : null}
      {!error && !url ? <PreviewHint text="Loading..." /> : null}
      {url ? <FilePreview url={url} name={name} kind={kind} /> : null}
    </div>
  );
}
