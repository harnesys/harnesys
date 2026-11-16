import type { OpenFileKind } from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { loadProjectFileBlob } from '@/shared/api/files';
import { FilePreview } from './file-preview';

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
        Loading...
      </div>
    );
  }
  return (
    <FilePreview
      url={url}
      name={path}
      kind={kind}
      path={path}
      projectId={projectId}
      worktreeId={worktreeId}
    />
  );
}
