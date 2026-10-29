import { Trash2Icon } from 'lucide-react';
import type { PlanItemStatus } from '@/entities/plan';
import { PlanStatusIcon, planProgress, usePlanStore, useThreadPlan } from '@/entities/plan';
import { useSelectedThread } from '@/features/desk';
import { deleteThreadPlan } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { Section } from './section';

const STATUS_LABEL: Record<PlanItemStatus, string> = {
  pending: 'pending',
  in_progress: 'running',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function PlanInspector() {
  const thread = useSelectedThread();
  const plan = useThreadPlan(thread?.id ?? null);
  const removeForThread = usePlanStore((state) => state.removeForThread);
  const bannerHidden = usePlanStore((state) => Boolean(state.bannerHidden[thread?.id ?? '']));
  if (!plan || plan.items.length === 0) {
    return null;
  }
  const { done, total } = planProgress(plan);
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
        if (confirmed && thread) {
          try {
            await deleteThreadPlan(thread.id);
            removeForThread(thread.id);
            toast.add({ title: 'Plan deleted' });
          } catch (error) {
            toast.add({
              title: 'Failed to delete plan',
              description: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      });
  };
  return (
    <Section
      label={`Plan ${done}/${total}`}
      action={
        <>
          <Switch
            size="sm"
            checked={!bannerHidden}
            onCheckedChange={(checked) => {
              if (thread) {
                usePlanStore.getState().setBannerHidden(thread.id, !checked);
              }
            }}
            aria-label="Show plan in thread composer"
            data-testid="plan-show-in-thread"
            title="Show plan above the composer"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete plan"
            className="text-muted-foreground"
            onClick={handleDelete}
          >
            <Trash2Icon />
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-0.5" data-testid="plan-inspector">
        {plan.items.map((item) => {
          const settled = item.status === 'completed' || item.status === 'cancelled';
          return (
            <li key={item.id}>
              <Collapsible>
                <CollapsibleTrigger className="group/plan flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40">
                  <span className="mt-px shrink-0">
                    <PlanStatusIcon status={item.status} />
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-[12px] leading-snug',
                      settled && 'text-muted-foreground',
                    )}
                  >
                    {item.title}
                  </span>
                  {item.subagentRole ? (
                    <span className="shrink-0 pt-px font-mono text-[10px] text-muted-foreground">
                      {item.subagentRole}
                    </span>
                  ) : null}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-1 pt-0.5 pr-1 pb-1.5 pl-[30px]">
                    {item.description ? (
                      <p className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-snug">
                        {item.description}
                      </p>
                    ) : null}
                    {item.resultNote ? (
                      <p className="whitespace-pre-wrap text-[11px] text-foreground/80 leading-snug">
                        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
                          {STATUS_LABEL[item.status]}
                        </span>{' '}
                        {item.resultNote}
                      </p>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
