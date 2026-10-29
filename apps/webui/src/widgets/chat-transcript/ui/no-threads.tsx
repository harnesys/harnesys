import { MessageSquarePlusIcon } from 'lucide-react';
import type { Agent } from '@/entities/agent';
import { useDeskStore } from '@/features/desk';
import { openNewThread } from '@/features/switch-thread';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
export function NoThreads({ agent }: { agent: Agent }) {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { openThread } = useStudioNavigation();
  return (
    <CategoryLanding data-testid="chat-empty-thread">
      <CategoryLandingEyebrow>CLEAR</CategoryLandingEyebrow>
      <CategoryLandingTitle>No thread on the floor</CategoryLandingTitle>
      <CategoryLandingDescription>
        {agent.name} is standing by. Start a thread to talk.
      </CategoryLandingDescription>
      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Start with
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<MessageSquarePlusIcon />}
            title="New thread"
            description={`A blank conversation with ${agent.name}.`}
            onClick={() => {
              if (!projectId) {
                return;
              }
              void openNewThread(agent.id, projectId).then((threadId) => {
                if (threadId) {
                  useDeskStore.getState().setFocusedThreadId(threadId);
                  openThread(projectId, threadId);
                }
              });
            }}
          />
        </CategoryLandingActions>
      </div>
    </CategoryLanding>
  );
}
