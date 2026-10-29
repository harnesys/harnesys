import {
  BookmarkPlusIcon,
  CopyIcon,
  GitBranchIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SpeakButton } from './speak-button';

interface MessageActionsProps {
  entryId: string;
  align?: 'start' | 'end';
  inherited?: boolean;
  speakText?: string;
  onCopy: () => void;
  onSaveAsBullet?: () => void;
  onEdit?: () => void;
  onBranch?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
}
export function MessageActions({
  entryId,
  align = 'start',
  inherited = false,
  speakText,
  onCopy,
  onSaveAsBullet,
  onEdit,
  onBranch,
  onRetry,
  onDelete,
}: MessageActionsProps) {
  if (inherited) {
    return null;
  }
  return (
    <div
      data-slot="message-actions"
      data-testid={`message-actions-${entryId}`}
      className={cn(
        'flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/turn:opacity-100 group-hover/turn:opacity-100',
        align === 'end' && 'self-end',
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={onCopy}
        aria-label="Copy"
      >
        <CopyIcon />
      </Button>
      {onSaveAsBullet ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onSaveAsBullet}
          aria-label="Save as bullet"
          title="Save as bullet"
        >
          <BookmarkPlusIcon />
        </Button>
      ) : null}
      {speakText ? <SpeakButton text={speakText} /> : null}
      {onEdit ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onEdit}
          aria-label="Edit"
        >
          <PencilIcon />
        </Button>
      ) : null}
      {onBranch ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onBranch}
          aria-label="Branch from here"
          title="Branch from here"
        >
          <GitBranchIcon />
        </Button>
      ) : null}
      {onRetry ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onRetry}
          aria-label="Retry"
          title="Retry"
        >
          <RotateCcwIcon />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onDelete}
          aria-label="Delete"
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  );
}
