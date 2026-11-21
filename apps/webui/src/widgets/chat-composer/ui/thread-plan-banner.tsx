import type { PlanItemStatus } from '@harnesys/studio-shared';
import { ChevronDownIcon, ListTodoIcon, Trash2Icon, XIcon } from 'lucide-react';
import { PlanStatusIcon, usePlanStore, useThreadPlan } from '@/entities/plan';
import { deleteThreadPlan } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { toast } from '@/shared/ui/toast';

export function ThreadPlanBanner({ threadId }: { threadId: string }) {
  const plan = useThreadPlan(threadId);
  const hidden = usePlanStore((state) => state.bannerHidden[threadId] ?? false);
  if (!plan || plan.items.length === 0 || hidden) {
    return null;
  }
  const hideBanner = () => usePlanStore.getState().setBannerHidden(threadId, true);
  const settled = (status: PlanItemStatus) =>
    status === 'completed' || status === 'cancelled' || status === 'failed';
  const active = plan.items.find((item) => item.status === 'in_progress');
  const allSettled = plan.items.every((item) => settled(item.status));
  const collapsedLabel = allSettled ? 'Done!' : (active?.title ?? null);
  const done = plan.items.filter((item) => item.status === 'completed').length;
  const handleDelete = () => {
    void alert
      .confirm({
        title: 'Delete plan?',
        description: 'Removes the agent plan for this thread.',
        confirmText: 'Delete',
        variant: 'destructive',
        testId: 'delete-plan-dialog',
      })
      .then(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        try {
          await deleteThreadPlan(threadId);
          usePlanStore.getState().removeForThread(threadId);
          toast.add({ title: 'Plan deleted' });
        } catch (error) {
          toast.add({
            title: 'Failed to delete plan',
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });
  };
  return (
    <Collapsible
      defaultOpen
      className="mb-1.5 rounded-xl border border-input px-3 py-2 text-xs dark:bg-input/30"
      data-testid="thread-plan-banner"
    >
      <div className="flex items-center gap-0.5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ListTodoIcon className="size-3 shrink-0" />
          <span>
            Plan {done}/{plan.items.length}
          </span>
          {collapsedLabel ? (
            <span className="min-w-0 truncate text-foreground group-data-[panel-open]:hidden">
              {collapsedLabel}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Delete plan"
          data-testid="thread-plan-banner-delete"
          className={cn('size-5 shrink-0 text-muted-foreground', !allSettled && 'hidden')}
          onClick={handleDelete}
        >
          <Trash2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Hide plan banner"
          data-testid="thread-plan-banner-hide"
          className="ml-auto size-5 shrink-0 text-muted-foreground"
          onClick={hideBanner}
        >
          <XIcon />
        </Button>
      </div>
      <CollapsibleContent>
        <ul className="flex flex-col gap-2 pt-1.5">
          {plan.items.map((item) => {
            const settled = item.status === 'completed' || item.status === 'cancelled';
            return (
              <li key={item.id} className="flex items-start gap-1.5">
                <span className="mt-px shrink-0">
                  <PlanStatusIcon status={item.status} />
                </span>
                <span
                  className={cn('min-w-0 flex-1 leading-snug', settled && 'text-muted-foreground')}
                >
                  {item.title}
                </span>
                {item.subagentRole ? (
                  <span className="shrink-0 pt-px font-mono text-[10px] text-muted-foreground">
                    {item.subagentRole}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
