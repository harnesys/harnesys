import { FileSearchIcon, LoaderCircleIcon } from 'lucide-react';
import type { ContentSearchFile, ContentSearchMatch } from '@/shared/api/content-search';
import { useFindInFilesPreview } from '../model/use-find-in-files-preview';
import { FindPlaceholder } from './find-placeholder';
import { FindPreviewEditor } from './find-preview-editor';

interface FindPreviewPaneProps {
  orgId: string;
  file: ContentSearchFile | null;
  match: ContentSearchMatch | null;
}

export function FindPreviewPane({ orgId, file, match }: FindPreviewPaneProps) {
  const preview = useFindInFilesPreview(orgId, file?.sourceId ?? null, file?.path ?? null);
  const content = preview.data?.encoding === 'utf-8' ? preview.data.content : null;
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border"
      data-testid="find-in-files-preview"
    >
      {renderPreview({
        content,
        file,
        match,
        loading: preview.isPending && file !== null,
        failed: preview.isError,
      })}
    </div>
  );
}

function renderPreview(input: {
  content: string | null;
  file: ContentSearchFile | null;
  match: ContentSearchMatch | null;
  loading: boolean;
  failed: boolean;
}) {
  if (!input.file || !input.match) {
    return <FindPlaceholder icon={<FileSearchIcon />} text="Select a match to preview the file." />;
  }
  if (input.loading) {
    return (
      <FindPlaceholder
        icon={<LoaderCircleIcon className="animate-spin" />}
        text="Loading preview…"
      />
    );
  }
  if (input.failed || input.content === null) {
    return (
      <FindPlaceholder icon={<FileSearchIcon />} text="Preview is unavailable for this file." />
    );
  }
  return (
    <div className="min-h-0 flex-1">
      <FindPreviewEditor file={input.file} match={input.match} content={input.content} />
    </div>
  );
}
