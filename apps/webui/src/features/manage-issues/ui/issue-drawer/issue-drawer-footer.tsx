import type { BoardStatus, IssueRecord } from '@harnesys/studio-shared';
import { XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/kbd';
import { SheetFooter } from '@/shared/ui/sheet';
import { Spinner } from '@/shared/ui/spinner';
import { statusOf } from '../../model/board-columns';
import type { IssueFormDraft } from '../../model/issue-draft';
import { isMacPlatform } from '../../model/issue-meta';

export function DrawerFooter({
  draft,
  isCreateMode,
  issue,
  statuses,
  saving,
  canSave,
  dirty,
  onSave,
  onDelete,
}: {
  draft: IssueFormDraft;
  isCreateMode: boolean;
  issue: IssueRecord | null;
  statuses: BoardStatus[];
  saving: boolean;
  canSave: boolean;
  dirty: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <SheetFooter className="mt-auto shrink-0 flex-row items-center justify-between gap-2 border-t px-5 py-3">
      {!isCreateMode && issue ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground text-xs hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <XIcon className="size-4" />
          Delete Issue
        </Button>
      ) : (
        <span className="text-muted-foreground text-xs">
          New issue → {statusOf(statuses, draft.statusKey)?.label ?? draft.statusKey}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="hidden select-none items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
          Press
          <Kbd className="h-4 px-1.5 text-[9px]">{isMacPlatform() ? '⌘' : 'Ctrl'}+S</Kbd>
          to save
        </span>
        <Button
          size="sm"
          disabled={!canSave || saving || (issue ? !dirty : false)}
          onClick={onSave}
          data-testid="issue-drawer-save"
        >
          {saving ? <Spinner className="size-3.5" /> : null}
          {isCreateMode ? 'Create Issue' : 'Save Changes'}
        </Button>
      </div>
    </SheetFooter>
  );
}
