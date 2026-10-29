import type { ThreadKind } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENTS_DISPLAY_STORAGE_KEY } from '@/shared/config/constants';

export const AGENT_THREAD_KINDS: readonly ThreadKind[] = [
  'chat',
  'issue',
  'schedule',
  'webhook',
  'connector',
];

interface AgentsDisplayState {
  expanded: Record<string, boolean>;
  threadKindFilter: Record<string, ThreadKind[]>;
  toggle: (agentId: string) => void;
  expand: (agentId: string) => void;
  forget: (agentId: string) => void;
  toggleKind: (agentId: string, kind: ThreadKind) => void;
  resetKinds: (agentId: string) => void;
}
export const useAgentsDisplayStore = create<AgentsDisplayState>()(
  persist(
    (set) => ({
      expanded: {},
      threadKindFilter: {},
      toggle: (agentId) =>
        set((state) => ({
          expanded: { ...state.expanded, [agentId]: !state.expanded[agentId] },
        })),
      expand: (agentId) =>
        set((state) =>
          state.expanded[agentId] ? state : { expanded: { ...state.expanded, [agentId]: true } },
        ),
      forget: (agentId) =>
        set((state) => {
          if (!(agentId in state.expanded) && !(agentId in state.threadKindFilter)) {
            return state;
          }
          const expanded = { ...state.expanded };
          delete expanded[agentId];
          const threadKindFilter = { ...state.threadKindFilter };
          delete threadKindFilter[agentId];
          return { expanded, threadKindFilter };
        }),
      toggleKind: (agentId, kind) =>
        set((state) => {
          const current = state.threadKindFilter[agentId] ?? [...AGENT_THREAD_KINDS];
          const next = current.includes(kind)
            ? current.filter((item) => item !== kind)
            : [...AGENT_THREAD_KINDS.filter((item) => item === kind || current.includes(item))];
          if (next.length === 0) {
            return state;
          }
          return { threadKindFilter: { ...state.threadKindFilter, [agentId]: next } };
        }),
      resetKinds: (agentId) =>
        set((state) => {
          if (!(agentId in state.threadKindFilter)) {
            return state;
          }
          const threadKindFilter = { ...state.threadKindFilter };
          delete threadKindFilter[agentId];
          return { threadKindFilter };
        }),
    }),
    {
      name: AGENTS_DISPLAY_STORAGE_KEY,
      version: 3,
      partialize: (state) => ({
        expanded: state.expanded,
        threadKindFilter: state.threadKindFilter,
      }),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<AgentsDisplayState>;
        const rawFilter = (state as { threadKindFilter?: unknown }).threadKindFilter;
        return {
          expanded:
            state.expanded && typeof state.expanded === 'object'
              ? Object.fromEntries(
                  Object.entries(state.expanded).filter(([, value]) => typeof value === 'boolean'),
                )
              : {},
          threadKindFilter:
            rawFilter && typeof rawFilter === 'object'
              ? Object.fromEntries(
                  Object.entries(rawFilter as Record<string, unknown>)
                    .map(([agentId, kinds]) => [
                      agentId,
                      Array.isArray(kinds)
                        ? AGENT_THREAD_KINDS.filter((kind) => (kinds as unknown[]).includes(kind))
                        : [],
                    ])
                    .filter(([, kinds]) => (kinds as ThreadKind[]).length > 0),
                )
              : {},
        } as AgentsDisplayState;
      },
    },
  ),
);
