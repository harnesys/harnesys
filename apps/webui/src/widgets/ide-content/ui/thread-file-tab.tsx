import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { openFileKind } from '@/features/open-file';
import { loadThreadAttachment, loadThreadFileContent } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { FileTypeIcon } from '@/shared/ui/icons';
import { DocumentPreview } from './document-preview';
import { PreviewHint } from './preview-hint';

export function ThreadFileTabContent({
  threadId,
  path,
  attachmentId,
}: {
  threadId: string;
  path: string;
  attachmentId?: string;
}) {
  const kind = openFileKind(path);
  if (kind === 'text' && !attachmentId) {
    return <ThreadTextPreview threadId={threadId} path={path} />;
  }
  return (
    <ThreadMediaPreview threadId={threadId} path={path} attachmentId={attachmentId} kind={kind} />
  );
}

function ThreadTextPreview({ threadId, path }: { threadId: string; path: string }) {
  const query = useQuery({
    queryKey: ['thread-file-text', threadId, path],
    queryFn: async () => (await loadThreadFileContent(threadId, path)).text(),
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread-file">
      {query.isPending ? <PreviewHint text="Loading…" /> : null}
      {query.isError ? <PreviewHint text="Could not load file." /> : null}
      {query.data != null ? <TextLines text={query.data} /> : null}
    </div>
  );
}

function TextLines({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
      {lines.length === 1 && lines[0] === '' ? (
        <PreviewHint text="Empty file." />
      ) : (
        <pre className="min-w-max font-mono text-[12px] leading-5">
          {lines.map((line, index) => (
            <span key={index} className="flex">
              <span className="w-12 shrink-0 select-none border-border/40 border-r px-2 text-right text-muted-foreground/50">
                {index + 1}
              </span>
              <span className="whitespace-pre px-3">{line || ' '}</span>
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

function ThreadMediaPreview({
  threadId,
  path,
  attachmentId,
  kind,
}: {
  threadId: string;
  path: string;
  attachmentId?: string;
  kind: ReturnType<typeof openFileKind>;
}) {
  const name = path.split('/').pop() || path;
  const { url, error } = useAuthedBlobUrl(
    () =>
      attachmentId
        ? loadThreadAttachment(threadId, attachmentId)
        : loadThreadFileContent(threadId, path),
    `${threadId}:${attachmentId ?? path}`,
  );
  const body = (() => {
    if (error) {
      return <PreviewHint text="Could not load file." />;
    }
    if (!url) {
      return <PreviewHint text="Loading…" />;
    }
    if (kind === 'image') {
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
        </div>
      );
    }
    if (kind === 'pdf') {
      return <iframe src={url} title={name} className="min-h-0 flex-1 bg-white" />;
    }
    if (kind === 'docx' || kind === 'xlsx') {
      return <DocumentPreview name={name} url={url} />;
    }
    return <DownloadCard name={name} url={url} />;
  })();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread-file">
      {body}
    </div>
  );
}

function DownloadCard({ name, url }: { name: string; url: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 px-8 py-6">
        <FileTypeIcon name={name} size="xl" />
        <div className="max-w-72 truncate text-sm" title={name}>
          {name}
        </div>
        <a
          href={url}
          download={name}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-primary-foreground text-xs transition-opacity hover:opacity-90"
        >
          <DownloadIcon className="size-3.5" />
          Download
        </a>
      </div>
    </div>
  );
}
