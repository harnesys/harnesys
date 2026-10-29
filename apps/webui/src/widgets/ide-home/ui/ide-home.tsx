import { BotIcon, CalendarClockIcon, CircleDotIcon, MessagesSquareIcon } from 'lucide-react';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore } from '@/entities/issue';
import { useActiveOrgStore } from '@/entities/org-machine';
import { setActiveThreadId } from '@/entities/thread';
import { useDeskStore } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { useIssueDrawerStore } from '@/features/manage-issues/model/issue-drawer.store';
import { createSchedule, openScheduleConfigDialog } from '@/features/manage-schedule';
import { openMarketplace } from '@/features/preset-marketplace';
import { openNewThread } from '@/features/switch-thread';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  CategoryLanding,
  CategoryLandingActionCard,
  CategoryLandingActions,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { toast } from '@/shared/ui/toast';
import { pickAgent } from './agent-pick-dialog';
import { pickBoard } from './board-pick-dialog';
export function IdeHome() {
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  const { openBoard, openSchedule, openThread } = useStudioNavigation();
  return (
    <CategoryLanding data-testid="ide-home">
      <CategoryLandingEyebrow>HOME</CategoryLandingEyebrow>
      <CategoryLandingTitle>Nothing open</CategoryLandingTitle>
      <CategoryLandingDescription>
        Open items from the sidebar appear here as tabs.
      </CategoryLandingDescription>
      <div className="mt-8">
        <p className="mb-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Create
        </p>
        <CategoryLandingActions>
          <CategoryLandingActionCard
            icon={<BotIcon />}
            title="New agent"
            description="Name and a job. Opens as a thread tab."
            onClick={() => {
              void openMarketplace({ kind: 'agent' });
            }}
          />
          <CategoryLandingActionCard
            icon={<CalendarClockIcon />}
            title="New schedule"
            description="Cron fires a run."
            onClick={() => {
              const agents = useAgentStore.getState().items.filter((a) => a.orgId === orgId);
              void openScheduleConfigDialog(agents, orgId).then(async (result) => {
                if (!result || result.deleted) {
                  return;
                }
                const draft = result.draft;
                const schedule = await createSchedule(orgId, draft);
                if (schedule) {
                  useIdeStore
                    .getState()
                    .openSchedule(orgId, schedule.id, schedule.threadId, schedule.targetAgentId);
                  openSchedule(orgId, schedule.id);
                }
              });
            }}
          />
          <CategoryLandingActionCard
            icon={<MessagesSquareIcon />}
            title="New thread"
            description="Pick an agent and start a chat."
            onClick={() => {
              void pickAgent(useAgentStore.getState().items.filter((a) => a.orgId === orgId)).then(
                async (agentId) => {
                  if (!agentId) {
                    return;
                  }
                  const threadId = await openNewThread(agentId, orgId);
                  if (!threadId) {
                    return;
                  }
                  useIdeStore.getState().openThread(orgId, agentId, threadId);
                  useDeskStore.getState().setFocusedThreadId(threadId);
                  setActiveThreadId(agentId, threadId);
                  openThread(orgId, threadId);
                },
              );
            }}
          />
          <CategoryLandingActionCard
            icon={<CircleDotIcon />}
            title="New issue"
            description="Create an issue on a board."
            onClick={() => {
              void pickBoard(useIssueBoardStore.getState().boards).then((boardId) => {
                if (!boardId) {
                  return;
                }
                const board = useIssueBoardStore.getState().boardById(boardId);
                const entryStatus = board?.statuses.find((status) => status.isEntry);
                if (!entryStatus) {
                  toast.add({
                    title: 'No entry status',
                    description: 'Mark a status as entry in board settings before creating issues.',
                    type: 'error',
                  });
                  return;
                }
                useIssueDrawerStore.getState().startCreate(boardId, entryStatus.key);
                openBoard(boardId);
              });
            }}
          />
        </CategoryLandingActions>
      </div>
    </CategoryLanding>
  );
}
