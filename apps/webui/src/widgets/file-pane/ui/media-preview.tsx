import type { OpenFileKind } from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { loadProjectFileBlob } from '@/shared/api/files';
import { DocumentPreview } from '@/widgets/ide-content/ui/document-preview';

export function MediaPreview({
  projectId,
  path,
  kind,
  worktreeId,
}: {
  projectId: string;
  path: string;
  kind: Extract<OpenFileKind, 'image' | 'pdf' | 'docx' | 'xlsx'>;
  worktreeId?: string;
}) {
  const { url, error } = useAuthedBlobUrl(
    () => loadProjectFileBlob(projectId, path, worktreeId),
    `${projectId}:${path}:${worktreeId ?? ''}`,
  );
  if (error) {
    return (
      <div
        className="flex h-full w-full items-center justify-center p-4 text-muted-foreground text-sm"
        data-testid="media-preview-error"
      >
        Could not load file.
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (kind === 'pdf') {
    return (
      <iframe
        title={path}
        src={url}
        className="h-full w-full border-0 bg-background"
        data-testid="pdf-preview"
      />
    );
  }
  if (kind === 'docx' || kind === 'xlsx') {
    return <DocumentPreview name={path} url={url} />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/20 p-4">
      <img
        src={url}
        alt={path}
        className="max-h-full max-w-full object-contain"
        data-testid="image-preview"
      />
    </div>
  );
}
