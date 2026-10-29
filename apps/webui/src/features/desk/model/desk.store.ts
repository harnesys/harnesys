import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { remapProjectOpenFiles } from './desk-path-remap';
export type InspectorTab = 'files' | 'inspector' | 'memory' | 'requests';
export interface AgentFileTab {
  path: string;
  dirty: boolean;
}
export interface AgentOpenFiles {
  tabs: AgentFileTab[];
  activePath: string | null;
}
export type ProjectFileTab = AgentFileTab;
export type ProjectOpenFiles = AgentOpenFiles;
export type DeskHydrateStatus = 'pending' | 'ready';
interface DeskState {
  inspectorTab: InspectorTab;
  inspectorOpen: boolean;
  hydrated: Record<string, DeskHydrateStatus>;
  focusedThreadId: string | null;
  filesByAgentId: Record<string, AgentOpenFiles>;
  filesByProjectId: Record<string, ProjectOpenFiles>;
}
type DeskStore = DeskState & {
  setHydrateStatus: (projectId: string, status: DeskHydrateStatus | null) => void;
  setFocusedThreadId: (threadId: string | null) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  openAgentFile: (agentId: string, path: string) => void;
  closeAgentFile: (agentId: string, path: string) => void;
  setActiveAgentFile: (agentId: string, path: string) => void;
  setAgentFileDirty: (agentId: string, path: string, dirty: boolean) => void;
  openProjectFile: (projectId: string, path: string) => void;
  closeProjectFile: (projectId: string, path: string) => void;
  setActiveProjectFile: (projectId: string, path: string) => void;
  setProjectFileDirty: (projectId: string, path: string, dirty: boolean) => void;
  remapProjectFiles: (projectId: string, moves: ProjectMoveItem[]) => void;
};
const emptyFiles = (): AgentOpenFiles => ({ tabs: [], activePath: null });
const initialDesk: DeskState = {
  inspectorTab: 'inspector',
  inspectorOpen: false,
  hydrated: {},
  focusedThreadId: null,
  filesByAgentId: {},
  filesByProjectId: {},
};
export const useDeskStore = create<DeskStore>((set) => ({
  ...initialDesk,
  setHydrateStatus: (projectId, status) =>
    set((state) => {
      if (status === null) {
        if (!(projectId in state.hydrated)) {
          return state;
        }
        const { [projectId]: _, ...hydrated } = state.hydrated;
        return { hydrated };
      }
      if (state.hydrated[projectId] === status) {
        return state;
      }
      return { hydrated: { ...state.hydrated, [projectId]: status } };
    }),
  setFocusedThreadId: (threadId) => set({ focusedThreadId: threadId }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  openAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId] ?? emptyFiles();
      const existing = current.tabs.find((tab) => tab.path === path);
      if (existing) {
        return {
          filesByAgentId: {
            ...state.filesByAgentId,
            [agentId]: { ...current, activePath: path },
          },
        };
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: {
            tabs: [...current.tabs, { path, dirty: false }],
            activePath: path,
          },
        },
      };
    }),
  closeAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current) {
        return state;
      }
      const tabs = current.tabs.filter((tab) => tab.path !== path);
      if (tabs.length === 0) {
        const next = { ...state.filesByAgentId };
        delete next[agentId];
        return { filesByAgentId: next };
      }
      const activePath =
        current.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : current.activePath;
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: { tabs, activePath },
        },
      };
    }),
  setActiveAgentFile: (agentId, path) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current?.tabs.some((tab) => tab.path === path)) {
        return state;
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: { ...current, activePath: path },
        },
      };
    }),
  setAgentFileDirty: (agentId, path, dirty) =>
    set((state) => {
      const current = state.filesByAgentId[agentId];
      if (!current) {
        return state;
      }
      return {
        filesByAgentId: {
          ...state.filesByAgentId,
          [agentId]: {
            ...current,
            tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, dirty } : tab)),
          },
        },
      };
    }),
  openProjectFile: (projectId, path) =>
    set((state) => {
      const current = state.filesByProjectId[projectId] ?? emptyFiles();
      const existing = current.tabs.find((tab) => tab.path === path);
      if (existing) {
        return {
          filesByProjectId: {
            ...state.filesByProjectId,
            [projectId]: { ...current, activePath: path },
          },
        };
      }
      return {
        filesByProjectId: {
          ...state.filesByProjectId,
          [projectId]: {
            tabs: [...current.tabs, { path, dirty: false }],
            activePath: path,
          },
        },
      };
    }),
  closeProjectFile: (projectId, path) =>
    set((state) => {
      const current = state.filesByProjectId[projectId];
      if (!current) {
        return state;
      }
      const tabs = current.tabs.filter((tab) => tab.path !== path);
      if (tabs.length === 0) {
        const next = { ...state.filesByProjectId };
        delete next[projectId];
        return { filesByProjectId: next };
      }
      const activePath =
        current.activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : current.activePath;
      return {
        filesByProjectId: {
          ...state.filesByProjectId,
          [projectId]: { tabs, activePath },
        },
      };
    }),
  setActiveProjectFile: (projectId, path) =>
    set((state) => {
      const current = state.filesByProjectId[projectId];
      if (!current?.tabs.some((tab) => tab.path === path)) {
        return state;
      }
      return {
        filesByProjectId: {
          ...state.filesByProjectId,
          [projectId]: { ...current, activePath: path },
        },
      };
    }),
  setProjectFileDirty: (projectId, path, dirty) =>
    set((state) => {
      const current = state.filesByProjectId[projectId];
      if (!current) {
        return state;
      }
      return {
        filesByProjectId: {
          ...state.filesByProjectId,
          [projectId]: {
            ...current,
            tabs: current.tabs.map((tab) => (tab.path === path ? { ...tab, dirty } : tab)),
          },
        },
      };
    }),
  remapProjectFiles: (projectId, moves) =>
    set((state) => {
      const current = state.filesByProjectId[projectId];
      if (!current || moves.length === 0) {
        return state;
      }
      const remapped = remapProjectOpenFiles(current, moves);
      if (remapped === current) {
        return state;
      }
      return {
        filesByProjectId: { ...state.filesByProjectId, [projectId]: remapped },
      };
    }),
}));
