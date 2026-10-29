import type { IssueAttachmentRecord } from '@harnesys/studio-shared';
import { FilePlus2Icon, PaperclipIcon, TrashIcon, UploadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { OpenAttachmentInput } from '@/features/ide';
import { useIdeStore, useOpenAttachmentTab } from '@/features/ide';
import { openProjectFile } from '@/features/open-file';
import { loadIssueAttachment } from '@/shared/api';
import { useAuthedBlobUrl } from '@/shared/api/blob-url';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { FileTypeIcon } from '@/shared/ui/icons';
import { Spinner } from '@/shared/ui/spinner';
import {
  deleteIssueAttachmentAction,
  uploadIssueAttachmentAction,
} from '../../model/issue-detail-actions';
import { SourceFilePicker } from './source-file-picker';

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function IssueAttachments({
  orgId,
  issueId,
  attachments,
  onChanged,
}: {
  orgId: string;
  issueId: string;
  attachments: IssueAttachmentRecord[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) {
        return;
      }
      setUploading(true);
      for (const file of files) {
        await uploadIssueAttachmentAction(orgId, issueId, file);
      }
      setUploading(false);
      onChanged();
    },
    [orgId, issueId, onChanged],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const editable =
        target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const hasText = Boolean(event.clipboardData?.getData('text/plain'));
      if (editable && hasText) {
        return;
      }
      event.preventDefault();
      void uploadFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [uploadFiles]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          Attachments
          {attachments.length > 0 ? (
            <span className="font-normal text-muted-foreground text-xs">{attachments.length}</span>
          ) : null}
        </h4>
        <div className="flex items-center gap-1">
          <SourceFilePicker orgId={orgId} issueId={issueId} onPicked={onChanged} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => fileInput.current?.click()}
            data-testid="issue-attach-file-btn"
          >
            <FilePlus2Icon className="size-3.5" />
            File
          </Button>
        </div>
      </div>
      <label
        data-testid="issue-attach-dropzone"
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors hover:bg-accent/30',
          'border-border bg-muted/20',
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {uploading ? (
          <Spinner className="mb-1 size-4 text-muted-foreground" />
        ) : (
          <UploadIcon className="mb-1 size-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground text-xs">Drop files here to attach</span>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void uploadFiles(Array.from(event.target.files));
            }
            event.target.value = '';
          }}
        />
      </label>
      {attachments.length === 0 ? (
        <p className="text-muted-foreground text-xs italic">No attachments yet.</p>
      ) : (
        <AttachmentGroup className="flex-wrap py-1">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              orgId={orgId}
              issueId={issueId}
              attachment={attachment}
              onRemoved={onChanged}
            />
          ))}
        </AttachmentGroup>
      )}
    </div>
  );
}

function AttachmentCard({
  orgId,
  issueId,
  attachment,
  onRemoved,
}: {
  orgId: string;
  issueId: string;
  attachment: IssueAttachmentRecord;
  onRemoved: () => void;
}) {
  const navigate = useNavigate();
  const { focus } = useStudioLocation();
  const openAttachmentTab = useOpenAttachmentTab(orgId);
  const { url } = useAuthedBlobUrl(
    attachment.kind === 'file' ? () => loadIssueAttachment(orgId, issueId, attachment.id) : null,
    attachment.id,
  );
  const openable =
    attachment.kind === 'source'
      ? Boolean(attachment.sourceId && attachment.sourcePath)
      : attachment.kind === 'file';
  const openInIde = () => {
    if (attachment.kind === 'source' && attachment.sourceId && attachment.sourcePath) {
      openProjectFile(attachment.sourceId, attachment.sourcePath);
      useIdeStore.getState().openFile(attachment.sourceId, attachment.sourcePath);
      void navigate(studioPath.file(orgId, attachment.sourceId, attachment.sourcePath));
      return;
    }
    if (attachment.kind === 'file') {
      const input: OpenAttachmentInput = {
        issueId,
        attachmentId: attachment.id,
        name: attachment.name,
        mediaType: attachment.mediaType,
      };
      openAttachmentTab(studioFocusProjectId(focus) ?? orgId, input);
    }
  };
  return (
    <Attachment
      size="sm"
      orientation="vertical"
      className={cn('group/attach relative', openable && 'cursor-pointer')}
      onClick={openable ? openInIde : undefined}
    >
      <AttachmentMedia variant={url && attachment.kindMedia === 'image' ? 'image' : 'icon'}>
        {url && attachment.kindMedia === 'image' ? (
          <img src={url} alt={attachment.name} />
        ) : (
          <FileTypeIcon name={attachment.name} mediaType={attachment.mediaType} />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="max-w-[7rem] truncate">{attachment.name}</AttachmentTitle>
        <AttachmentDescription>
          {attachment.kind === 'source' ? (
            <span className="truncate">{attachment.sourcePath ?? 'source'}</span>
          ) : (
            formatBytes(attachment.sizeBytes)
          )}
        </AttachmentDescription>
      </AttachmentContent>
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        title="Delete attachment"
        className="absolute top-1 right-1 z-20 hidden group-hover/attach:flex"
        onClick={(event) => {
          event.stopPropagation();
          void deleteIssueAttachmentAction(orgId, issueId, attachment.id).then((ok) => {
            if (ok) {
              onRemoved();
            }
          });
        }}
      >
        <TrashIcon className="size-3" />
        <span className="sr-only">Delete attachment</span>
      </Button>
    </Attachment>
  );
}
