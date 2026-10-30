import {
  CalendarClockIcon,
  EarthIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAgentStore } from '@/entities/agent';
import { scheduleStatusLabel, useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore, webhookStatusLabel } from '@/entities/webhook';
import { useProjectAgents } from '@/features/desk';
import { useIdeStore } from '@/features/ide';
import { updateSchedule } from '@/features/manage-schedule';
import { deleteWebhook, openWebhookConfigDialog, updateWebhook } from '@/features/manage-webhook';
import { webhookDisplayUrl } from '@/shared/lib/webhook-display-url';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ThreadRunStatusBar } from '@/widgets/thread-run-status';

export interface ThreadDockIdentity {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function ThreadDock({
  identity,
  threadId,
  issueId,
}: {
  identity: ThreadDockIdentity;
  threadId?: string;
  issueId?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3" data-testid="thread-dock">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-background">
        <div className="flex items-center gap-2.5 px-3 py-2">
          {identity.icon ? (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 text-muted-foreground [&_svg]:size-3.5">
              {identity.icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm leading-tight">{identity.title}</div>
            {identity.meta ? (
              <div className="truncate font-mono text-[11px] text-muted-foreground leading-tight">
                {identity.meta}
              </div>
            ) : null}
          </div>
          {identity.actions}
        </div>
        {threadId ? (
          <div className="border-border/40 border-t">
            <ThreadRunStatusBar threadId={threadId} issueId={issueId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThreadTriggerDock({
  threadId,
  projectId,
  issueId,
}: {
  threadId: string;
  projectId: string;
  issueId?: string | null;
}) {
  const thread = useThreadStore((state) => state.byId(threadId) ?? undefined);
  const schedule = useScheduleStore((state) =>
    state.items.find((item) => item.threadId === threadId && item.projectId === projectId),
  );
  const webhook = useWebhookStore((state) =>
    state.items.find((item) => item.threadId === threadId && item.projectId === projectId),
  );
  const agents = useProjectAgents(projectId);
  const agent = useAgentStore((state) =>
    thread ? (state.byId(thread.agentId) ?? undefined) : undefined,
  );
  if (schedule) {
    return (
      <ThreadDock
        identity={{
          icon: <CalendarClockIcon />,
          title: schedule.name,
          meta: (
            <>
              {schedule.cron} · {scheduleStatusLabel(schedule.status)}
              {agent ? ` · ${agent.name}` : ''}
            </>
          ),
          actions: (
            <TriggerPauseButton
              paused={schedule.status === 'paused'}
              onToggle={() => {
                void updateSchedule(projectId, schedule.id, {
                  status: schedule.status === 'paused' ? 'active' : 'paused',
                });
              }}
            />
          ),
        }}
        threadId={threadId}
        issueId={issueId}
      />
    );
  }
  if (webhook) {
    return (
      <ThreadDock
        identity={{
          icon: <EarthIcon />,
          title: webhook.name,
          meta: (
            <>
              {webhookDisplayUrl(webhook.endpoint)} · {webhookStatusLabel(webhook.status)}
              {agent ? ` · ${agent.name}` : ''}
            </>
          ),
          actions: (
            <>
              <TriggerPauseButton
                paused={webhook.status === 'paused'}
                onToggle={() => {
                  void updateWebhook(projectId, webhook.id, {
                    status: webhook.status === 'paused' ? 'active' : 'paused',
                  });
                }}
              />
              <WebhookActionsMenu projectId={projectId} webhookId={webhook.id} agents={agents} />
            </>
          ),
        }}
        threadId={threadId}
        issueId={issueId}
      />
    );
  }
  return (
    <ThreadDock
      identity={{
        icon: <FallbackIcon kind={thread?.kind ?? 'chat'} />,
        title: thread?.title ?? '',
        meta: agent?.name,
      }}
      threadId={threadId}
      issueId={issueId}
    />
  );
}

function TriggerPauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" title={paused ? 'Resume' : 'Pause'} onClick={onToggle}>
      {paused ? <PlayIcon /> : <PauseIcon />}
    </Button>
  );
}

function WebhookActionsMenu({
  projectId,
  webhookId,
  agents,
}: {
  projectId: string;
  webhookId: string;
  agents: ReturnType<typeof useProjectAgents>;
}) {
  const webhook = useWebhookStore((state) =>
    state.items.find((item) => item.id === webhookId && item.projectId === projectId),
  );
  if (!webhook) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Webhook actions" />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            void openWebhookConfigDialog(agents, projectId, webhook).then(async (result) => {
              if (!result) {
                return;
              }
              if (result.deleted) {
                await deleteWebhook(projectId, webhook);
                useIdeStore.getState().closeByEntity(projectId, 'webhook', webhook.id);
                return;
              }
              await updateWebhook(projectId, webhook.id, result.draft);
            });
          }}
        >
          Configure…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FallbackIcon({ kind }: { kind: string }) {
  if (kind === 'schedule') {
    return <CalendarClockIcon />;
  }
  if (kind === 'webhook') {
    return <EarthIcon />;
  }
  return <MessageSquareIcon />;
}
