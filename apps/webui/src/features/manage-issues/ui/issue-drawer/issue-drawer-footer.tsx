import { XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/kbd';
import { SheetFooter } from '@/shared/ui/sheet';
import { Spinner } from '@/shared/ui/spinner';
import { isMacPlatform } from '../../model/issue-meta';

export function DrawerFooter({
  saving,
  canSave,
  dirty,
  isDraft,
  onSave,
  onDelete,
}: {
  saving: boolean;
  canSave: boolean;
  dirty: boolean;
  isDraft: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <SheetFooter className="mt-auto shrink-0 flex-row items-center justify-between gap-2 border-t px-5 py-3">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground text-xs hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <XIcon className="size-4" />
        Delete Issue
      </Button>
      <div className="flex items-center gap-2">
        <span className="hidden select-none items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
          Press
          <Kbd className="h-4 px-1.5 text-[9px]">{isMacPlatform() ? '⌘' : 'Ctrl'}+S</Kbd>
          to save
        </span>
        <Button
          size="sm"
          disabled={!canSave || saving || (!isDraft && !dirty)}
          onClick={onSave}
          data-testid="issue-drawer-save"
        >
          {saving ? <Spinner className="size-3.5" /> : null}
          {isDraft ? 'Create Issue' : 'Save Changes'}
        </Button>
      </div>
    </SheetFooter>
  );
}
