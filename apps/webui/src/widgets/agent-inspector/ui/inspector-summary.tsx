import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';

interface InspectorSummaryProps {
  agent: Agent;
  thread: Thread | null;
  entries: number;
  streaming: boolean;
  waiting: boolean;
}

interface ThreadStatus {
  tone: StatusDotTone;
  label: string;
}

export function InspectorSummary({
  agent,
  thread,
  entries,
  streaming,
  waiting,
}: InspectorSummaryProps) {
  const timeZone = useOrgTimeZone();
  const status = threadStatus(streaming, waiting, Boolean(thread?.lastError));
  return (
    <div className="flex flex-col gap-2" data-testid="inspector-summary">
      <div className="flex items-center gap-2.5">
        <AgentRecordAvatar agent={agent} className="size-6 text-[10px]" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-medium text-[13px] leading-tight">{agent.name}</p>
          <p className="truncate text-[11px] text-muted-foreground leading-tight">
            {thread ? thread.title || 'Untitled thread' : agent.role}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusDot tone={status.tone} label={status.label} />
          <span className="font-mono text-[10px] text-muted-foreground">{status.label}</span>
        </span>
      </div>
      {thread ? (
        <div className="flex items-baseline justify-between gap-3 font-mono text-[10px] text-muted-foreground">
          <span>
            {entries} {entries === 1 ? 'entry' : 'entries'}
          </span>
          <span>{formatDayTime(thread.updatedAt, timeZone)}</span>
        </div>
      ) : null}
    </div>
  );
}

function threadStatus(streaming: boolean, waiting: boolean, failed: boolean): ThreadStatus {
  if (waiting) {
    return { tone: 'wait', label: 'Waiting' };
  }
  if (streaming) {
    return { tone: 'live', label: 'Running' };
  }
  if (failed) {
    return { tone: 'danger', label: 'Error' };
  }
  return { tone: 'idle', label: 'Idle' };
}
