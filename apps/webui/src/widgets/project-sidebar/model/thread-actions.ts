import { useSessionStore } from '@/entities/session';
import { setActiveThreadId, type Thread, useThreadStore } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { confirmDeleteThread, openNewThread } from '@/features/switch-thread';
import { deleteThreadRecord, setThreadPinned } from '@/shared/api';
import { useStudioNavigation } from '@/shared/config/navigation';
export function openThreadRecord(thread: Thread, projectId: string): void {
  if (thread.kind === 'schedule' || thread.kind === 'webhook') {
    return;
  }
  useIdeStore.getState().openThread(projectId, thread.agentId, thread.id);
  useDeskStore.getState().setFocusedThreadId(thread.id);
  setActiveThreadId(thread.agentId, thread.id);
}
export function useThreadActions(projectId: string) {
  const { openThread: navigateToThread } = useStudioNavigation();
  const openThread = (thread: Thread) => {
    openThreadRecord(thread, projectId);
    navigateToThread(projectId, thread.id);
  };
  const createThread = (agentId: string) => {
    void openNewThread(agentId, projectId).then((threadId) => {
      if (!threadId) {
        return;
      }
      const thread = useThreadStore.getState().byId(threadId);
      if (thread) {
        openThread(thread);
      }
    });
  };
  const togglePin = (thread: Thread) => {
    const next = thread.pinned !== true;
    void setThreadPinned(thread.id, next)
      .catch(() => null)
      .then((record) => {
        useThreadStore.getState().setPinned(thread.id, record ? record.pinned : next);
      });
  };
  const removeThread = (thread: Thread) => {
    if (thread.kind !== 'chat') {
      return;
    }
    void confirmDeleteThread(thread).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      void deleteThreadRecord(thread.id)
        .catch(() => {})
        .finally(() => {
          useSessionStore.getState().removeForThreads([thread.id]);
          useThreadStore.getState().remove(thread.id);
          useIdeStore.getState().closeByEntity(projectId, 'thread', thread.id);
        });
    });
  };
  return { openThread, createThread, togglePin, removeThread };
}
export function useOpenThread() {
  const { openThread } = useStudioNavigation();
  return (thread: Thread) => {
    if (!thread.orgId) {
      return;
    }
    openThreadRecord(thread, thread.orgId);
    openThread(thread.orgId, thread.id);
  };
}
