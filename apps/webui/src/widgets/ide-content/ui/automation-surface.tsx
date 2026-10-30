import { useAgentStore } from '@/entities/agent';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { HitlPrompt } from '@/features/send-message';
import { ThreadTriggerDock } from '@/widgets/thread-dock';
import { ThreadJournal } from '@/widgets/thread-journal';

function NotFound({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
      {text}
    </div>
  );
}

function TriggerSurface({
  projectId,
  threadId,
  agentId,
  kind,
  testId,
}: {
  projectId: string;
  threadId: string;
  agentId: string;
  kind: 'schedule' | 'webhook';
  testId: string;
}) {
  const agent = useAgentStore((state) => state.byId(agentId) ?? undefined);
  const thread = useThreadStore((state) => state.byId(threadId) ?? undefined);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
      {thread && agent ? (
        <>
          <ThreadJournal threadId={thread.id} agent={agent} kind={kind} />
          <HitlPrompt />
          <ThreadTriggerDock threadId={thread.id} projectId={projectId} />
        </>
      ) : (
        <NotFound text="Journal unavailable" />
      )}
    </div>
  );
}

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
    return <NotFound text="Schedule not found" />;
  }
  return (
    <TriggerSurface
      projectId={projectId}
      threadId={schedule.threadId}
      agentId={schedule.targetAgentId}
      kind="schedule"
      testId="ide-schedule"
    />
  );
}

export function WebhookSurface({ projectId, webhookId }: { projectId: string; webhookId: string }) {
  const webhook = useWebhookStore((state) =>
    state.items.find((item) => item.id === webhookId && item.projectId === projectId),
  );
  if (!webhook) {
    return <NotFound text="Webhook not found" />;
  }
  return (
    <TriggerSurface
      projectId={projectId}
      threadId={webhook.threadId}
      agentId={webhook.targetAgentId}
      kind="webhook"
      testId="ide-webhook"
    />
  );
}
