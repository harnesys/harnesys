import {
  blobContentBackend,
  type FileRef,
  fileRefPath,
  type OpenFileKind,
} from '@/features/open-file';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { PreviewHint } from '@/widgets/ide-content/ui/preview-hint';
import { DxfPreview } from './dxf-preview';
import { FilePreview, type FilePreviewKind } from './file-preview';

export function FileRefPreview({ target, kind }: { target: FileRef; kind: OpenFileKind }) {
  if (kind === 'dxf') {
    return <DxfPreview target={target} />;
  }
  return <BlobFilePreview target={target} kind={kind} />;
}

function BlobFilePreview({ target, kind }: { target: FileRef; kind: FilePreviewKind }) {
  const backend = blobContentBackend(target);
  const { url, error } = useAuthedBlobUrl(backend.load, backend.key);
  if (error) {
    return <PreviewHint text="Could not load file." />;
  }
  if (!url) {
    return <PreviewHint text="Loading..." />;
  }
  const path = fileRefPath(target);
  const project = target.source === 'project' ? target : null;
  return (
    <FilePreview
      url={url}
      name={path}
      kind={kind}
      path={project?.path}
      projectId={project?.projectId}
      worktreeId={project?.worktreeId}
    />
  );
}
