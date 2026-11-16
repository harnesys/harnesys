import { openFileKind } from '@/features/open-file';
import { loadIssueAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { PreviewHint } from '@/widgets/ide-content/ui/preview-hint';
import { FilePreview } from './file-preview';

export type AttachmentPreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'docx' | 'xlsx';

export function attachmentPreviewKind(name: string, mediaType: string): AttachmentPreviewKind {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType === 'application/pdf') {
    return 'pdf';
  }
  if (mediaType.startsWith('text/')) {
    return 'text';
  }
  const byName = openFileKind(name);
  if (byName === 'image' || byName === 'pdf' || byName === 'docx' || byName === 'xlsx') {
    return byName;
  }
  return 'text';
}

export function AttachmentPreview({
  orgId,
  issueId,
  attachmentId,
  name,
  kind,
}: {
  orgId: string;
  issueId: string;
  attachmentId: string;
  name: string;
  kind: AttachmentPreviewKind;
}) {
  const { url, error } = useAuthedBlobUrl(
    () => loadIssueAttachment(orgId, issueId, attachmentId),
    attachmentId,
  );
  if (error) {
    return <PreviewHint text="Failed to load attachment" />;
  }
  if (!url) {
    return <PreviewHint text="Loading..." />;
  }
  return <FilePreview url={url} name={name} kind={kind} />;
}
