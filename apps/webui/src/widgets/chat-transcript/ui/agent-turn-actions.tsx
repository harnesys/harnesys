import { useDeskStore, useSelectedAgent, useSelectedThread } from '@/features/desk';
import { branchThread } from '@/features/switch-thread';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { toast } from '@/shared/ui/toast';
import { MessageActions } from './message-actions';

export function TurnMessageActions({
  runId,
  answerText,
  inherited,
  onReply,
}: {
  runId: string;
  answerText: string;
  inherited: boolean;
  onReply?: () => void;
}) {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { openThread } = useStudioNavigation();
  return (
    <MessageActions
      entryId={runId}
      inherited={inherited}
      speakText={answerText}
      onReply={onReply}
      onCopy={() => {
        void navigator.clipboard.writeText(answerText);
        toast.add({ title: 'Copied.' });
      }}
      onBranch={() => {
        if (!agent || !thread || !projectId) {
          return;
        }
        void branchThread(runId, agent.id, thread.id, projectId).then((nextId) => {
          if (nextId) {
            useDeskStore.getState().setFocusedThreadId(nextId);
            openThread(projectId, nextId);
          }
        });
      }}
    />
  );
}
