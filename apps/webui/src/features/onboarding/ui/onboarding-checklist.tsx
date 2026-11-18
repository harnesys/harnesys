import { CheckIcon, ChevronRightIcon, ListChecksIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useIssueDrawerStore } from '@/features/manage-issues/model/issue-drawer.store';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import {
  CHECKLIST_BODY,
  CHECKLIST_HIDE,
  CHECKLIST_HINTS,
  CHECKLIST_LABELS,
  CHECKLIST_TITLE,
} from '../model/onboarding-copy';
import type { OnboardingChecklistKey } from '../model/onboarding-progress';
import { loadOnboardingState, patchOnboardingState } from '../model/onboarding-storage';
import type { StarterTaskKey } from '../model/starter-board';
import {
  type OnboardingStarterTargets,
  useOnboardingProgress,
} from '../model/use-onboarding-progress';

interface ChecklistActions {
  openSettings: (category: 'providers') => void;
  openBoard: (boardId: string) => void;
  openStarterIssue: (issueId: string) => void;
  goDesk: () => void;
  goPresets: () => void;
}

export function OnboardingChecklist({ className }: { className?: string }) {
  const orgId = useOrgId();
  const { ready, checklist, starter } = useOnboardingProgress(orgId);
  const navigate = useNavigate();
  const { openBoard, openSettings } = useStudioNavigation();
  const openIssue = useIssueDrawerStore((state) => state.openIssue);
  const [dismissed, setDismissed] = useState(
    () => loadOnboardingState().checklistDismissedAt !== null,
  );
  const [open, setOpen] = useState(false);

  if (!orgId || !ready || dismissed || checklist.complete) {
    return null;
  }

  const hide = () => {
    patchOnboardingState({ checklistDismissedAt: new Date().toISOString() });
    setDismissed(true);
  };
  const actions: ChecklistActions = {
    openSettings,
    openBoard,
    openStarterIssue: openIssue,
    goDesk: () => void navigate(studioPath.desk(orgId)),
    goPresets: () => void navigate(studioPath.onboardingPresets(orgId)),
  };
  const onSelect = (key: OnboardingChecklistKey) => {
    setOpen(false);
    runChecklistAction(key, starter, actions);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="Getting set up"
            aria-label={`Getting set up, ${checklist.done} of ${checklist.total} done`}
            data-testid="onboarding-checklist-trigger"
            className={cn('relative text-muted-foreground', className)}
          >
            <ListChecksIcon />
            <span
              className="live-dot absolute top-1 right-1 size-1.5 rounded-full bg-live"
              aria-hidden="true"
              data-testid="onboarding-checklist-dot"
            />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-3"
        data-testid="onboarding-checklist"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-sm">{CHECKLIST_TITLE}</p>
          <span className="font-mono text-[10px] text-muted-foreground">
            {checklist.done}/{checklist.total}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{CHECKLIST_BODY}</p>
        <ul className="mt-3 flex flex-col gap-0.5">
          {checklist.items.map((item) => (
            <ChecklistRow key={item.key} itemKey={item.key} done={item.done} onSelect={onSelect} />
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-center text-muted-foreground"
          onClick={hide}
          data-testid="onboarding-checklist-hide"
        >
          {CHECKLIST_HIDE}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ChecklistRow({
  itemKey,
  done,
  onSelect,
}: {
  itemKey: OnboardingChecklistKey;
  done: boolean;
  onSelect: (key: OnboardingChecklistKey) => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={done}
        onClick={() => onSelect(itemKey)}
        data-testid={`onboarding-checklist-${itemKey}`}
        className={cn(
          'group flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors',
          done
            ? 'cursor-default opacity-55'
            : 'hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
            done ? 'border-live bg-live text-background' : 'border-border text-transparent',
          )}
          aria-hidden="true"
        >
          <CheckIcon className="size-2.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block font-medium text-xs leading-4',
              done && 'text-muted-foreground line-through decoration-border',
            )}
          >
            {CHECKLIST_LABELS[itemKey]}
          </span>
          {done ? null : (
            <span className="mt-0.5 block text-[11px] text-muted-foreground leading-snug">
              {CHECKLIST_HINTS[itemKey]}
            </span>
          )}
        </span>
        {done ? null : (
          <ChevronRightIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        )}
      </button>
    </li>
  );
}

function runChecklistAction(
  key: OnboardingChecklistKey,
  starter: OnboardingStarterTargets,
  actions: ChecklistActions,
): void {
  if (key === 'provider' || key === 'models') {
    actions.openSettings('providers');
    return;
  }
  if (key === 'agents') {
    actions.goPresets();
    return;
  }
  if (key === 'board') {
    actions.goDesk();
    return;
  }
  if (!starter.boardId) {
    actions.goDesk();
    return;
  }
  actions.openBoard(starter.boardId);
  const issueId = starter.issueIds[starterTaskFor(key)];
  if (issueId) {
    actions.openStarterIssue(issueId);
  }
}

function starterTaskFor(key: OnboardingChecklistKey): StarterTaskKey {
  if (key === 'issueDone') {
    return 'moveTask';
  }
  return key === 'dashboard' ? 'dashboards' : 'tour';
}
