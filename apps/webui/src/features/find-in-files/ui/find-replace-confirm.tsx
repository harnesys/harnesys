import { Button } from '@/shared/ui/button';

interface FindReplaceConfirmProps {
  matches: number;
  files: number;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}

export function FindReplaceConfirm({
  matches,
  files,
  applying,
  onApply,
  onCancel,
}: FindReplaceConfirmProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-live/40 bg-live/10 px-2 py-1 text-xs"
      data-testid="find-in-files-replace-confirm"
    >
      <span>
        Replace {matches} {matches === 1 ? 'match' : 'matches'} in {files}{' '}
        {files === 1 ? 'file' : 'files'}?
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          className="h-7"
          data-testid="find-in-files-replace-apply"
          disabled={applying}
          onClick={onApply}
        >
          Replace
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          data-testid="find-in-files-replace-cancel"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
