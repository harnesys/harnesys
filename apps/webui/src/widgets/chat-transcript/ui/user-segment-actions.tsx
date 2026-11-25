import { saveAgentBullet } from '@/entities/agent';
import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import {
  deleteOptimisticUserMessage,
  deleteUserMessage,
  reloadUserMessage,
  sendMessage,
} from '@/features/send-message';
import { branchThread } from '@/features/switch-thread';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { toast } from '@/shared/ui/toast';
import { MessageActions } from './message-actions';
import type { SendInput } from './user-message-edit';

export function UserSegmentActions({
  entryId,
  align,
  rawText,
  bulletText,
  threadId,
  runId,
  anchored,
  onToggleAnchor,
  onReply,
  threadSeq,
  sendInput,
  clientEventId,
  onEdit,
}: {
  entryId: string;
  align: 'start' | 'end';
  rawText: string;
  bulletText: string;
  threadId: string;
  runId?: string;
  anchored: boolean;
  onToggleAnchor?: () => void;
  onReply?: () => void;
  threadSeq?: number;
  sendInput: SendInput;
  clientEventId?: string;
  onEdit?: () => void;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { openThread } = useStudioNavigation();
  return (
    <MessageActions
      entryId={entryId}
      align={align}
      anchored={anchored}
      onToggleAnchor={onToggleAnchor}
      onReply={onReply}
      onEdit={onEdit}
      onCopy={() => {
        void navigator.clipboard.writeText(rawText);
        toast.add({ title: 'Copied.' });
      }}
      onSaveAsBullet={
        agent && bulletText.trim().length > 0
          ? () => {
              saveAgentBullet(agent, bulletText);
              toast.add({ title: 'Saved as bullet.' });
            }
          : undefined
      }
      onRetry={() => {
        if (threadSeq !== undefined) {
          void reloadUserMessage({
            threadId,
            threadSeq,
            text: rawText,
            ...sendInput,
          }).catch((error) => {
            toast.add({
              title: 'Could not reload',
              description: error instanceof Error ? error.message : 'Reload failed',
            });
          });
          return;
        }
        if (clientEventId) {
          deleteOptimisticUserMessage(threadId, clientEventId);
          void sendMessage({ threadId, content: rawText, ...sendInput });
        }
      }}
      onBranch={
        !runId
          ? undefined
          : () => {
              if (!agent || !thread || !projectId) {
                return;
              }
              void branchThread(runId, agent.id, thread.id, projectId).then((nextId) => {
                if (nextId) {
                  useDeskStore.getState().setFocusedThreadId(nextId);
                  openThread(projectId, nextId);
                }
              });
            }
      }
      onDelete={() => {
        if (threadSeq !== undefined) {
          void deleteUserMessage(threadId, threadSeq).catch((error) => {
            toast.add({
              title: 'Could not delete',
              description: error instanceof Error ? error.message : 'Delete failed',
            });
          });
          return;
        }
        if (clientEventId) {
          deleteOptimisticUserMessage(threadId, clientEventId);
        }
      }}
    />
  );
}
