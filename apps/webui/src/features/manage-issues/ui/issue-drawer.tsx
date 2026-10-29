import { useEffect, useRef, useState } from 'react';
import { useIssueStore } from '@/entities/issue';
import { cn } from '@/shared/lib/utils';
import { Resizer } from '@/shared/ui/resizer';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { Spinner } from '@/shared/ui/spinner';
import {
  draftDiff,
  draftFromRecord,
  emptyIssueDraft,
  type IssueFormDraft,
} from '../model/issue-draft';
import { type IssueDrawerTarget, useIssueDrawerStore } from '../model/issue-drawer.store';
import { createIssueFromDraft, updateIssuePatch } from '../model/issues';
import { useIssueDetail } from '../model/use-issue-detail';
import { DrawerBody } from './issue-drawer/issue-drawer-body';
import { DrawerProblem } from './issue-drawer/issue-drawer-header';

const MIN_PANEL_WIDTH = 380;
const INITIAL_PANEL_WIDTH = 896;

export function IssueDrawer({ orgId }: { orgId: string }) {
  const target = useIssueDrawerStore((state) => state.target);
  const closeDrawer = useIssueDrawerStore((state) => state.close);
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  const issueId = target?.mode === 'edit' ? target.issueId : null;
  const issue = useIssueStore((state) => (issueId ? state.byId(issueId) : undefined));
  const detailState = useIssueDetail(orgId, issueId);
  const { draft, setDraft, boardId, setCreateBoardId } = useIssueDraft(target);
  const { width, isResizing, onResizeStart } = useResizablePanel();
  const [saving, setSaving] = useState(false);

  const editMode = target?.mode === 'edit';
  const waitingDetail = Boolean(editMode) && detailState.loading && !detailState.detail;
  const brokenDetail =
    Boolean(editMode) && !waitingDetail && (Boolean(detailState.error) || !issue);
  const showContent = target !== null && !waitingDetail && !brokenDetail;

  const save = async (): Promise<void> => {
    if (draft.title.trim().length === 0 || saving) {
      return;
    }
    if (target?.mode === 'create') {
      setSaving(true);
      const created = await createIssueFromDraft(orgId, {
        ...draft,
        boardId,
        parentIssueId: target.parentIssueId,
      });
      setSaving(false);
      if (created) {
        closeDrawer();
        openIssue(created.id);
      }
      return;
    }
    if (!issue) {
      return;
    }
    const body = draftDiff(issue, draft);
    if (Object.keys(body).length === 0) {
      return;
    }
    setSaving(true);
    const ok = await updateIssuePatch(orgId, issue.id, body);
    setSaving(false);
    if (ok) {
      const fresh = useIssueStore.getState().byId(issue.id);
      if (fresh) {
        setDraft(draftFromRecord(fresh));
      }
    }
  };

  useEffect(() => {
    if (!target) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0"
        style={{ width, maxWidth: '95vw' }}
        data-testid="issue-drawer"
      >
        <div className={cn('relative flex h-full flex-col', isResizing && 'select-none')}>
          <div className="absolute inset-y-0 left-0 z-50 w-1.5 [&>button]:h-full">
            <Resizer
              label="Resize issue drawer"
              testId="issue-drawer-resizer"
              dragging={isResizing}
              onResizeStart={onResizeStart}
            />
          </div>
          {waitingDetail ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-8" />
            </div>
          ) : null}
          {brokenDetail ? (
            <DrawerProblem message={detailState.error ?? 'Issue not found'} onClose={closeDrawer} />
          ) : null}
          {showContent && target ? (
            <DrawerBody
              orgId={orgId}
              target={target}
              issue={issue ?? null}
              detail={detailState}
              draft={draft}
              setDraft={setDraft}
              boardId={boardId}
              setCreateBoardId={setCreateBoardId}
              saving={saving}
              onSave={() => void save()}
              onClose={closeDrawer}
              onOpenIssue={openIssue}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useIssueDraft(target: IssueDrawerTarget | null): {
  draft: IssueFormDraft;
  setDraft: (draft: IssueFormDraft) => void;
  boardId: string;
  setCreateBoardId: (boardId: string) => void;
} {
  const issueId = target?.mode === 'edit' ? target.issueId : null;
  const issue = useIssueStore((state) => (issueId ? state.byId(issueId) : undefined));
  const [draft, setDraft] = useState<IssueFormDraft>(emptyIssueDraft);
  const [createBoardId, setCreateBoardId] = useState('');
  const appliedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!target) {
      appliedKey.current = null;
      return;
    }
    if (target.mode === 'create') {
      const key = `create-${target.boardId}-${target.statusKey}-${target.parentIssueId ?? ''}`;
      if (appliedKey.current !== key) {
        setDraft(emptyIssueDraft(target.statusKey));
        setCreateBoardId(target.boardId);
        appliedKey.current = key;
      }
      return;
    }
    if (issue && appliedKey.current !== target.issueId) {
      setDraft(draftFromRecord(issue));
      appliedKey.current = target.issueId;
    }
  }, [target, issue]);

  const boardId = target?.mode === 'create' ? createBoardId : (issue?.boardId ?? '');
  return { draft, setDraft, boardId, setCreateBoardId };
}

function useResizablePanel(): {
  width: number;
  isResizing: boolean;
  onResizeStart: (event: React.MouseEvent) => void;
} {
  const [width, setWidth] = useState(() =>
    Math.min(INITIAL_PANEL_WIDTH, Math.round(window.innerWidth * 0.95)),
  );
  const [isResizing, setIsResizing] = useState(false);
  const onResizeStart = (mouseDown: React.MouseEvent): void => {
    mouseDown.preventDefault();
    setIsResizing(true);
    const maxWidth = window.innerWidth * 0.95;
    const onMove = (move: MouseEvent): void => {
      const next = window.innerWidth - move.clientX;
      if (next >= MIN_PANEL_WIDTH && next <= maxWidth) {
        setWidth(next);
      }
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return { width, isResizing, onResizeStart };
}
