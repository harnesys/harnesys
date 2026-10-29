import { create } from 'zustand';
import { SOURCES_VISIBILITY_STORAGE_KEY } from '@/shared/config/constants';

const EMPTY_HIDDEN: string[] = [];

interface SourceVisibilityState {
  hidden: Record<string, string[]>;
  toggleHidden: (orgId: string, sourceId: string, hidden: boolean) => void;
  showAll: (orgId: string) => void;
}

function sanitize(input: unknown): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  if (!input || typeof input !== 'object') {
    return next;
  }
  for (const [orgId, ids] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    const cleaned = ids.filter((id): id is string => typeof id === 'string');
    if (cleaned.length > 0) {
      next[orgId] = Array.from(new Set(cleaned));
    }
  }
  return next;
}

function load(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SOURCES_VISIBILITY_STORAGE_KEY);
    if (raw) {
      return sanitize(JSON.parse(raw));
    }
  } catch {}
  return {};
}

function persist(hidden: Record<string, string[]>): void {
  try {
    localStorage.setItem(SOURCES_VISIBILITY_STORAGE_KEY, JSON.stringify(hidden));
  } catch {}
}

export const useSourceVisibilityStore = create<SourceVisibilityState>((set) => ({
  hidden: load(),
  toggleHidden: (orgId, sourceId, hidden) => {
    if (!orgId) {
      return;
    }
    const state = useSourceVisibilityStore.getState();
    const ids = new Set(state.hidden[orgId] ?? EMPTY_HIDDEN);
    if (hidden) {
      ids.add(sourceId);
    } else {
      ids.delete(sourceId);
    }
    const next = { ...state.hidden };
    const list = Array.from(ids);
    if (list.length > 0) {
      next[orgId] = list;
    } else {
      delete next[orgId];
    }
    persist(next);
    set({ hidden: next });
  },
  showAll: (orgId) => {
    if (!orgId) {
      return;
    }
    const state = useSourceVisibilityStore.getState();
    if (!state.hidden[orgId]) {
      return;
    }
    const next = { ...state.hidden };
    delete next[orgId];
    persist(next);
    set({ hidden: next });
  },
}));

export function useHiddenSourceIds(orgId: string): string[] {
  return useSourceVisibilityStore((state) => state.hidden[orgId] ?? EMPTY_HIDDEN);
}
