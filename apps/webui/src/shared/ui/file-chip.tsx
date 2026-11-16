import { DownloadIcon, XIcon } from 'lucide-react';
import { fileExtLabel, formatBytes } from '@/shared/lib/file-meta';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/shared/ui/attachment';
import { FileTypeIcon } from '@/shared/ui/icons';
export function FileChip({
  name,
  mediaType,
  bytes,
  href,
  onOpen,
  onRemove,
}: {
  name: string;
  mediaType: string;
  bytes?: number;
  href?: string;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const detail = [fileExtLabel(name, mediaType), bytes != null ? formatBytes(bytes) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Attachment size="sm" className="min-w-0 max-w-64 gap-2.5 p-2">
      <FileTypeIcon name={name} mediaType={mediaType} size="2xl" />
      <AttachmentContent>
        <AttachmentTitle title={name}>{name}</AttachmentTitle>
        {detail ? <AttachmentDescription>{detail}</AttachmentDescription> : null}
      </AttachmentContent>
      {chipTrigger(name, href, onOpen)}
      {onRemove || (onOpen && href) ? (
        <AttachmentActions>
          {onOpen && href ? (
            <AttachmentAction
              render={<a href={href} download={name} />}
              aria-label={`Download ${name}`}
            >
              <DownloadIcon />
            </AttachmentAction>
          ) : null}
          {onRemove ? (
            <AttachmentAction type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
              <XIcon />
            </AttachmentAction>
          ) : null}
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}

function chipTrigger(name: string, href: string | undefined, onOpen: (() => void) | undefined) {
  if (onOpen) {
    return <AttachmentTrigger onClick={onOpen} />;
  }
  if (href) {
    return <AttachmentTrigger render={<a href={href} download={name} />} />;
  }
  return null;
}
