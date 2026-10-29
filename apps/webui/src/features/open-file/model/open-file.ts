import { type AgentOpenFiles, type ProjectOpenFiles, useDeskStore } from '@/features/desk';

const EMPTY_OPEN_FILES: AgentOpenFiles = { tabs: [], activePath: null };
const EMPTY_PROJECT_FILES: ProjectOpenFiles = { tabs: [], activePath: null };
export function openProjectFile(projectId: string, path: string) {
  useDeskStore.getState().openProjectFile(projectId, path);
}
export function closeProjectFile(projectId: string, path: string) {
  useDeskStore.getState().closeProjectFile(projectId, path);
}
export function selectProjectFile(projectId: string, path: string) {
  useDeskStore.getState().setActiveProjectFile(projectId, path);
}
export function markProjectFileDirty(projectId: string, path: string, dirty: boolean) {
  useDeskStore.getState().setProjectFileDirty(projectId, path, dirty);
}
export function useProjectOpenFiles(projectId: string | null) {
  return useDeskStore((state) => {
    if (!projectId) {
      return EMPTY_PROJECT_FILES;
    }
    return state.filesByProjectId[projectId] ?? EMPTY_PROJECT_FILES;
  });
}
export function useAgentOpenFiles(agentId: string | null) {
  return useDeskStore((state) => {
    if (!agentId) {
      return EMPTY_OPEN_FILES;
    }
    return state.filesByAgentId[agentId] ?? EMPTY_OPEN_FILES;
  });
}
