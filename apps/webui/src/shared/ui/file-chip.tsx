import { XIcon } from 'lucide-react';
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
  onRemove,
}: {
  name: string;
  mediaType: string;
  bytes?: number;
  href?: string;
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
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
            <XIcon />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
      {href ? <AttachmentTrigger render={<a href={href} download={name} />} /> : null}
    </Attachment>
  );
}
