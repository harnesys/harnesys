import type { PlanItemStatus, PlanStatus, ThreadPlanRecord } from '@harnesys/studio-shared';
import { create } from 'zustand';

export type { PlanItemStatus, PlanStatus, ThreadPlanRecord };
export function planProgress(plan: ThreadPlanRecord): {
  done: number;
  total: number;
} {
  const done = plan.items.filter(
    (item) =>
      item.status === 'completed' || item.status === 'cancelled' || item.status === 'failed',
  ).length;
  return { done, total: plan.items.length };
}
interface PlanStore {
  byThread: Record<string, ThreadPlanRecord>;
  byThreadId: (threadId: string | null | undefined) => ThreadPlanRecord | null;
  bannerHidden: Record<string, boolean>;
  upsert: (plan: ThreadPlanRecord) => void;
  removeForThread: (threadId: string) => void;
  setBannerHidden: (threadId: string, hidden: boolean) => void;
}
const BANNER_HIDDEN_STORAGE_KEY = 'harnesys:plan-banner-hidden';
function readBannerHidden(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(BANNER_HIDDEN_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function persistBannerHidden(hidden: Record<string, boolean>): void {
  try {
    localStorage.setItem(BANNER_HIDDEN_STORAGE_KEY, JSON.stringify(hidden));
  } catch {}
}
export const usePlanStore = create<PlanStore>((set, get) => ({
  byThread: {},
  byThreadId: (threadId) => (threadId ? (get().byThread[threadId] ?? null) : null),
  bannerHidden: readBannerHidden(),
  upsert: (plan) => {
    set((state) => ({ byThread: { ...state.byThread, [plan.threadId]: plan } }));
  },
  removeForThread: (threadId) => {
    set((state) => {
      if (!state.byThread[threadId]) {
        return state;
      }
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    });
  },
  setBannerHidden: (threadId, hidden) => {
    set((state) => {
      const bannerHidden = { ...state.bannerHidden, [threadId]: hidden };
      persistBannerHidden(bannerHidden);
      return { bannerHidden };
    });
  },
}));
