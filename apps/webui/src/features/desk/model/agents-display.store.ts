import type { ThreadKind } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENTS_DISPLAY_STORAGE_KEY } from '@/shared/config/constants';

export const AGENT_THREAD_KINDS: readonly Exclude<ThreadKind, 'group'>[] = [
  'chat',
  'issue',
  'schedule',
  'webhook',
];

interface AgentsDisplayState {
  expanded: Record<string, boolean>;
  threadKindFilter: Record<string, ThreadKind[]>;
  showFinishedThreads: Record<string, boolean>;
  departmentExpanded: Record<string, boolean>;
  toggle: (agentId: string) => void;
  expand: (agentId: string) => void;
  forget: (agentId: string) => void;
  toggleDepartment: (departmentId: string) => void;
  forgetDepartment: (departmentId: string) => void;
  toggleKind: (agentId: string, kind: ThreadKind) => void;
  resetKinds: (agentId: string) => void;
  toggleShowFinished: (agentId: string) => void;
}
export const useAgentsDisplayStore = create<AgentsDisplayState>()(
  persist(
    (set) => ({
      expanded: {},
      threadKindFilter: {},
      showFinishedThreads: {},
      departmentExpanded: {},
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
          if (
            !(agentId in state.expanded) &&
            !(agentId in state.threadKindFilter) &&
            !(agentId in state.showFinishedThreads) &&
            !(agentId in state.departmentExpanded)
          ) {
            return state;
          }
          const expanded = { ...state.expanded };
          delete expanded[agentId];
          const threadKindFilter = { ...state.threadKindFilter };
          delete threadKindFilter[agentId];
          const showFinishedThreads = { ...state.showFinishedThreads };
          delete showFinishedThreads[agentId];
          const departmentExpanded = { ...state.departmentExpanded };
          delete departmentExpanded[agentId];
          return { expanded, threadKindFilter, showFinishedThreads, departmentExpanded };
        }),
      toggleDepartment: (departmentId) =>
        set((state) => ({
          departmentExpanded: {
            ...state.departmentExpanded,
            [departmentId]: !state.departmentExpanded[departmentId],
          },
        })),
      forgetDepartment: (departmentId) =>
        set((state) => {
          if (!(departmentId in state.departmentExpanded)) {
            return state;
          }
          const departmentExpanded = { ...state.departmentExpanded };
          delete departmentExpanded[departmentId];
          return { departmentExpanded };
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
      toggleShowFinished: (agentId) =>
        set((state) => ({
          showFinishedThreads: {
            ...state.showFinishedThreads,
            [agentId]: !state.showFinishedThreads[agentId],
          },
        })),
    }),
    {
      name: AGENTS_DISPLAY_STORAGE_KEY,
      version: 5,
      partialize: (state) => ({
        expanded: state.expanded,
        threadKindFilter: state.threadKindFilter,
        showFinishedThreads: state.showFinishedThreads,
        departmentExpanded: state.departmentExpanded,
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
          showFinishedThreads:
            state.showFinishedThreads && typeof state.showFinishedThreads === 'object'
              ? Object.fromEntries(
                  Object.entries(state.showFinishedThreads).filter(
                    ([, value]) => typeof value === 'boolean' && value,
                  ),
                )
              : {},
          departmentExpanded:
            state.departmentExpanded && typeof state.departmentExpanded === 'object'
              ? Object.fromEntries(
                  Object.entries(state.departmentExpanded).filter(
                    ([, value]) => typeof value === 'boolean',
                  ),
                )
              : {},
        } as AgentsDisplayState;
      },
    },
  ),
);
