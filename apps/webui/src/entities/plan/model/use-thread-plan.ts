import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import { useEffect } from 'react';
import { loadThreadPlan } from './load-thread-plan';
import { usePlanStore } from './plan.store';

export function useThreadPlan(threadId: string | null | undefined): ThreadPlanRecord | null {
  const plan = usePlanStore((state) => (threadId ? (state.byThread[threadId] ?? null) : null));
  useEffect(() => {
    if (threadId) {
      void loadThreadPlan(threadId);
    }
  }, [threadId]);
  return plan;
}
