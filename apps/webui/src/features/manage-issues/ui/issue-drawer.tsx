import type { IssueRecord } from '@harnesys/studio-shared';
import { useEffect, useRef, useState } from 'react';
import { useIssueStore } from '@/entities/issue';
import { cn } from '@/shared/lib/utils';
import { Resizer } from '@/shared/ui/resizer';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { Spinner } from '@/shared/ui/spinner';
import { confirmDeleteIssue } from '../model/issue-dialogs';
import {
  draftDiff,
  draftFromRecord,
  emptyIssueDraft,
  type IssueFormDraft,
  isPristineDraft,
} from '../model/issue-draft';
import { type IssueDrawerTarget, useIssueDrawerStore } from '../model/issue-drawer.store';
import { commitIssue, deleteIssue, updateIssuePatch } from '../model/issues';
import { useIssueDetail } from '../model/use-issue-detail';
import { DrawerBody } from './issue-drawer/issue-drawer-body';
import { DrawerProblem } from './issue-drawer/issue-drawer-header';

const MIN_PANEL_WIDTH = 380;
const INITIAL_PANEL_WIDTH = 896;

export function IssueDrawer({ orgId }: { orgId: string }) {
  const target = useIssueDrawerStore((state) => state.target);
  const closeDrawer = useIssueDrawerStore((state) => state.close);
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  const markCommitted = useIssueDrawerStore((state) => state.markCommitted);
  const issueId = target?.issueId ?? null;
  const isDraft = target?.draft ?? false;
  const issue = useIssueStore((state) => (issueId ? state.byId(issueId) : undefined));
  const detailState = useIssueDetail(orgId, issueId);
  const { draft, setDraft, seed } = useIssueDraft(target);
  const { width, isResizing, onResizeStart } = useResizablePanel();
  const [saving, setSaving] = useState(false);

  const waitingDetail = Boolean(issueId) && detailState.loading && !detailState.detail;
  const brokenDetail = Boolean(issueId) && !waitingDetail && (Boolean(detailState.error) || !issue);
  const showContent = target !== null && !waitingDetail && !brokenDetail;

  const save = async (): Promise<void> => {
    if (!issue || saving || draft.title.trim().length === 0) {
      return;
    }
    setSaving(true);
    const body = draftDiff(issue, draft);
    if (Object.keys(body).length > 0) {
      await updateIssuePatch(orgId, issue.id, body);
    }
    if (isDraft && (await commitIssue(orgId, issue.id, draft.statusKey))) {
      markCommitted();
    }
    setSaving(false);
    const fresh = useIssueStore.getState().byId(issue.id);
    if (fresh) {
      setDraft(draftFromRecord(fresh));
    }
  };

  const flush = async (): Promise<void> => {
    if (!issue) {
      closeDrawer();
      return;
    }
    if (isDraft) {
      if (seed && isPristineDraft(issue, seed, draft, detailState.detail)) {
        await deleteIssue(orgId, issue.id);
        closeDrawer();
        return;
      }
      await save();
    }
    closeDrawer();
  };

  const switchTo = async (nextIssueId: string): Promise<void> => {
    await flush();
    openIssue(nextIssueId);
  };

  const remove = async (): Promise<void> => {
    if (!issue) {
      return;
    }
    if (await confirmDeleteIssue(issue)) {
      await deleteIssue(orgId, issue.id);
      closeDrawer();
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
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && void flush()}>
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
            <DrawerProblem
              message={detailState.error ?? 'Issue not found'}
              onClose={() => void flush()}
            />
          ) : null}
          {showContent && target && issue ? (
            <DrawerBody
              orgId={orgId}
              issue={issue}
              detail={detailState}
              draft={draft}
              setDraft={setDraft}
              boardId={issue.boardId}
              saving={saving}
              isDraft={isDraft}
              onSave={() => void save()}
              onDelete={() => void remove()}
              onClose={() => void flush()}
              onOpenIssue={(nextId) => void switchTo(nextId)}
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
  seed: IssueRecord | null;
} {
  const issue = useIssueStore((state) => (target ? state.byId(target.issueId) : undefined));
  const [draft, setDraft] = useState<IssueFormDraft>(emptyIssueDraft);
  const [seed, setSeed] = useState<IssueRecord | null>(null);
  const appliedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!target) {
      appliedKey.current = null;
      setSeed(null);
      return;
    }
    if (issue && appliedKey.current !== issue.id) {
      setDraft(draftFromRecord(issue));
      setSeed(issue);
      appliedKey.current = issue.id;
    }
  }, [target, issue]);

  return { draft, setDraft, seed };
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
