import { Editor } from '@monaco-editor/react';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { monacoLanguageId } from '@/shared/lib/monaco';
import { detectLanguage } from '@/shared/lib/tool-code';
import { FileTypeIcon } from '@/shared/ui/icons';
import { MonacoBoundary } from '@/shared/ui/monaco-boundary';
import { Spinner } from '@/shared/ui/spinner';
import { useTheme } from '@/shared/ui/theme-provider';
import { DocumentPreview } from '@/widgets/ide-content/ui/document-preview';
import { PreviewHint } from '@/widgets/ide-content/ui/preview-hint';
import { editorThemeName } from '../model/editor-setup';
import { CsvViewer } from './csv-viewer';
import { ImageViewer } from './image-viewer';
import { defineAppThemes } from './monaco-themes';

export type FilePreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'dxf'
  | 'csv'
  | 'text';

export function FilePreview({
  url,
  name,
  kind,
  path,
  projectId,
  worktreeId,
}: {
  url: string;
  name: string;
  kind: FilePreviewKind;
  path?: string;
  projectId?: string;
  worktreeId?: string;
}) {
  if (kind === 'image') {
    return (
      <ImageViewer url={url} path={path ?? name} projectId={projectId} worktreeId={worktreeId} />
    );
  }
  if (kind === 'pdf') {
    return (
      <iframe
        title={name}
        src={url}
        className="h-full w-full border-0 bg-background"
        data-testid="pdf-preview"
      />
    );
  }
  if (kind === 'docx' || kind === 'xlsx') {
    return <DocumentPreview name={name} url={url} />;
  }
  if (kind === 'video') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <video src={url} controls className="max-h-full max-w-full" data-testid="video-preview">
          <track kind="captions" />
        </video>
      </div>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <audio src={url} controls className="w-full max-w-md" data-testid="audio-preview">
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  if (kind === 'dxf') {
    return <DownloadCard name={name} url={url} />;
  }
  if (kind === 'csv') {
    return <CsvViewer url={url} />;
  }
  return <TextBlobPreview url={url} name={name} />;
}

function TextBlobPreview({ url, name }: { url: string; name: string }) {
  const { theme } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setText(null);
    setBinary(false);
    setFailed(false);
    void fetch(url)
      .then((response) => response.text())
      .then((value) => {
        if (value.includes('\u0000')) {
          setBinary(true);
          return;
        }
        setText(value);
      })
      .catch(() => setFailed(true));
  }, [url]);
  if (failed) {
    return <PreviewHint text="Could not load file." />;
  }
  if (binary) {
    return <PreviewHint text="Binary content cannot be shown as text" />;
  }
  if (text === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  return (
    <MonacoBoundary
      fallback={
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Spinner className="size-5" />
        </div>
      }
    >
      <Editor
        height="100%"
        value={text}
        language={monacoLanguageId(detectLanguage(name) ?? 'plaintext')}
        theme={editorThemeName(theme)}
        options={{ readOnly: true, minimap: { enabled: false } }}
        loading={<Spinner className="size-5 text-muted-foreground" />}
        beforeMount={defineAppThemes}
      />
    </MonacoBoundary>
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
