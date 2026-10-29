import { MoreHorizontalIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { type Agent, useAgentStore } from '@/entities/agent';
import { type Schedule, scheduleStatusLabel, useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, type Webhook, webhookStatusLabel } from '@/entities/webhook';
import { useProjectAgents } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { updateSchedule } from '@/features/manage-schedule';
import { deleteWebhook, openWebhookConfigDialog, updateWebhook } from '@/features/manage-webhook';
import { HitlPrompt } from '@/features/send-message';
import { webhookDisplayUrl } from '@/shared/lib/webhook-display-url';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ThreadJournal } from '@/widgets/thread-journal';
import { ThreadRunStatusBar } from '@/widgets/thread-run-status';
export function ScheduleSurface({
  projectId,
  scheduleId,
}: {
  projectId: string;
  scheduleId: string;
}) {
  const schedule = useScheduleStore((state) =>
    state.items.find((item) => item.id === scheduleId && item.projectId === projectId),
  );
  if (!schedule) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Schedule not found
      </div>
    );
  }
  return <ScheduleSurfaceView schedule={schedule} />;
}
export function WebhookSurface({ projectId, webhookId }: { projectId: string; webhookId: string }) {
  const webhook = useWebhookStore((state) =>
    state.items.find((item) => item.id === webhookId && item.projectId === projectId),
  );
  const agents = useProjectAgents(projectId);
  if (!webhook) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Webhook not found
      </div>
    );
  }
  return <WebhookSurfaceView webhook={webhook} agents={agents} />;
}
function ScheduleSurfaceView({ schedule }: { schedule: Schedule }) {
  const agent = useAgentStore((state) => state.byId(schedule.targetAgentId) ?? undefined);
  const thread = useThreadStore((state) => state.byId(schedule.threadId) ?? undefined);
  const paused = schedule.status === 'paused';
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-schedule">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{schedule.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {schedule.cron} · {scheduleStatusLabel(schedule.status)}
            {agent ? ` · ${agent.name}` : ''}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void updateSchedule(schedule.projectId, schedule.id, {
              status: paused ? 'active' : 'paused',
            });
          }}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      </div>
      {thread && agent ? (
        <>
          <ThreadJournal threadId={thread.id} agent={agent} kind="schedule" />
          <HitlPrompt />
          <ThreadRunStatusBar threadId={thread.id} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Journal unavailable
        </div>
      )}
    </div>
  );
}
function WebhookSurfaceView({ webhook, agents }: { webhook: Webhook; agents: Agent[] }) {
  const agent = useAgentStore((state) => state.byId(webhook.targetAgentId) ?? undefined);
  const thread = useThreadStore((state) => state.byId(webhook.threadId) ?? undefined);
  const paused = webhook.status === 'paused';
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-webhook">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{webhook.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {webhookDisplayUrl(webhook.endpoint)} · {webhookStatusLabel(webhook.status)}
            {agent ? ` · ${agent.name}` : ''}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title={paused ? 'Resume' : 'Pause'}
          onClick={() => {
            void updateWebhook(webhook.projectId, webhook.id, {
              status: paused ? 'active' : 'paused',
            });
          }}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Webhook actions" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                void openWebhookConfigDialog(agents, webhook.projectId, webhook).then(
                  async (result) => {
                    if (!result) {
                      return;
                    }
                    if (result.deleted) {
                      await deleteWebhook(webhook.projectId, webhook);
                      useIdeStore
                        .getState()
                        .closeByEntity(webhook.projectId, 'webhook', webhook.id);
                      return;
                    }
                    await updateWebhook(webhook.projectId, webhook.id, result.draft);
                  },
                );
              }}
            >
              Configure…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {thread && agent ? (
        <>
          <ThreadJournal threadId={thread.id} agent={agent} kind="webhook" />
          <HitlPrompt />
          <ThreadRunStatusBar threadId={thread.id} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Journal unavailable
        </div>
      )}
    </div>
  );
}
