import { Editor } from '@monaco-editor/react';
import { useEffect, useState } from 'react';
import { openFileKind } from '@/features/open-file';
import { loadIssueAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { detectLanguage } from '@/shared/lib/tool-code';
import { Spinner } from '@/shared/ui/spinner';
import { useTheme } from '@/shared/ui/theme-provider';
import { DocumentPreview } from '@/widgets/ide-content/ui/document-preview';
import { editorThemeName } from '../model/editor-setup';
import { defineAppThemes } from './monaco-themes';
import '@/shared/lib/monaco';

export type AttachmentPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'docx'
  | 'xlsx'
  | 'unsupported';

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
  if (byName === 'docx' || byName === 'xlsx') {
    return byName;
  }
  return 'unsupported';
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
  const { url } = useAuthedBlobUrl(
    () => loadIssueAttachment(orgId, issueId, attachmentId),
    attachmentId,
  );
  if (kind === 'pdf') {
    return (
      <iframe
        title={name}
        src={url ?? undefined}
        className="h-full w-full border-0 bg-background"
        data-testid="attachment-pdf-preview"
      />
    );
  }
  if (kind === 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted/20 p-4">
        <img
          src={url ?? undefined}
          alt={name}
          className="max-h-full max-w-full object-contain"
          data-testid="attachment-image-preview"
        />
      </div>
    );
  }
  if (kind === 'video') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <video
          src={url ?? undefined}
          controls
          className="max-h-full max-w-full"
          data-testid="attachment-video-preview"
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <audio
          src={url ?? undefined}
          controls
          className="w-full max-w-md"
          data-testid="attachment-audio-preview"
        >
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  if (kind === 'text') {
    return (
      <AttachmentTextPreview
        orgId={orgId}
        issueId={issueId}
        attachmentId={attachmentId}
        name={name}
      />
    );
  }
  if (kind === 'docx' || kind === 'xlsx') {
    if (!url) {
      return (
        <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
          Loading…
        </div>
      );
    }
    return <DocumentPreview name={name} url={url} />;
  }
  return (
    <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
      Preview is not available
    </div>
  );
}

function AttachmentTextPreview({
  orgId,
  issueId,
  attachmentId,
  name,
}: {
  orgId: string;
  issueId: string;
  attachmentId: string;
  name: string;
}) {
  const { theme } = useTheme();
  const { url, error } = useAuthedBlobUrl(
    () => loadIssueAttachment(orgId, issueId, attachmentId),
    attachmentId,
  );
  const [text, setText] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  useEffect(() => {
    setText(null);
    setBinary(false);
    if (!url) {
      return;
    }
    void fetch(url)
      .then((response) => response.text())
      .then((value) => {
        if (value.includes('\u0000')) {
          setBinary(true);
          return;
        }
        setText(value);
      })
      .catch(() => setBinary(true));
  }, [url]);
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4 text-muted-foreground text-sm">
        Failed to load attachment
      </div>
    );
  }
  if (binary) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4 text-muted-foreground text-sm">
        Binary content cannot be shown as text
      </div>
    );
  }
  if (text === null) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  return (
    <Editor
      height="100%"
      value={text}
      language={detectLanguage(name) ?? 'plaintext'}
      theme={editorThemeName(theme)}
      options={{ readOnly: true, minimap: { enabled: false } }}
      loading={<Spinner className="size-5 text-muted-foreground" />}
      beforeMount={defineAppThemes}
    />
  );
}
