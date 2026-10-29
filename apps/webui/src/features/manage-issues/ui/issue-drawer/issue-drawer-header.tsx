import type { IssueRecord } from '@harnesys/studio-shared';
import { AlertTriangleIcon, CheckIcon, CopyIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { issueCode } from '../../model/board-columns';
import type { IssueFormDraft } from '../../model/issue-draft';
import { issueTypeHeaderIcon } from '../../model/issue-meta';

export function DrawerHeader({
  draft,
  isCreateMode,
  issue,
  parent,
  copied,
  onTitleChange,
  onCopy,
  onOpenParent,
  onClose,
}: {
  draft: IssueFormDraft;
  isCreateMode: boolean;
  issue: IssueRecord | null;
  parent: IssueRecord | null;
  copied: boolean;
  onTitleChange: (title: string) => void;
  onCopy: () => void;
  onOpenParent: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
      {parent ? (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>Subtask of</span>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => onOpenParent(parent.id)}
          >
            <span className="shrink-0 font-mono text-[10px]">{issueCode(parent.id)}</span>
            <span className="max-w-[280px] truncate">{parent.title}</span>
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {!isCreateMode && issue ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-muted-foreground text-xs uppercase">
              {issueCode(issue.id)}
            </span>
            <button
              type="button"
              onClick={onCopy}
              title="Copy full issue ID"
              className="flex items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? (
                <CheckIcon className="size-3 text-status-ok" />
              ) : (
                <CopyIcon className="size-3" />
              )}
            </button>
          </div>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted shadow-inner">
          {isCreateMode ? issueTypeHeaderIcon('task') : null}
          {!isCreateMode && issue ? issueTypeHeaderIcon(issue.type) : null}
        </span>
        <Input
          value={draft.title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={isCreateMode ? 'New Issue Title...' : 'Issue Title...'}
          className="h-auto border-transparent bg-transparent px-2 font-semibold text-lg shadow-none focus-visible:border-transparent focus-visible:ring-0"
          data-testid="issue-drawer-title"
          autoFocus={isCreateMode}
        />
      </div>
    </div>
  );
}

export function DrawerProblem({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <AlertTriangleIcon className="size-10 text-destructive/60" />
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
