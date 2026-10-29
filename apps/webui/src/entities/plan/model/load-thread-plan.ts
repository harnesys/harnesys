import { getThreadPlan } from '@/shared/api';
import { usePlanStore } from './plan.store';

export function loadThreadPlan(threadId: string): Promise<void> {
  return getThreadPlan(threadId)
    .then((plan) => {
      if (plan) {
        usePlanStore.getState().upsert(plan);
      } else {
        usePlanStore.getState().removeForThread(threadId);
      }
    })
    .catch(() => {});
}
