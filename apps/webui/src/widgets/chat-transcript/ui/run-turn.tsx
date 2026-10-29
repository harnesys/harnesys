import type { FeedRun } from '@/entities/session';
import { deleteErrorEvent } from '@/features/send-message';
import { toast } from '@/shared/ui/toast';
import { AssistantMessageView, FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';

export function RunTurn({
  run,
  runId,
  streaming = false,
  threadId,
  onOpenSpawn,
  onRetry,
  readOnly = false,
  inherited = false,
  branchChildren,
}: {
  run: FeedRun;
  runId: string;
  streaming?: boolean;
  threadId?: string;
  onOpenSpawn?: (spawnId: string) => void;
  onRetry?: () => void;
  readOnly?: boolean;
  inherited?: boolean;
  branchChildren?: BranchChild[];
}) {
  const deletable = !streaming && !readOnly && !inherited ? errorEventOf(run) : undefined;
  return (
    <div className="group/turn flex flex-col gap-3">
      <AssistantMessageView
        run={run}
        runId={runId}
        streaming={streaming}
        threadId={threadId}
        onOpenSpawn={onOpenSpawn}
        readOnly={readOnly}
        inherited={inherited}
        branchChildren={branchChildren}
      />
      {run.error ? (
        <FailedMessageView
          text={run.error}
          onRetry={onRetry}
          onDelete={
            deletable && threadId
              ? () => {
                  const target = deletable;
                  void deleteErrorEvent(
                    threadId,
                    target.runId,
                    target.seq,
                    run.error ?? undefined,
                  ).catch((error) => {
                    toast.add({
                      title: 'Could not delete',
                      description: error instanceof Error ? error.message : 'Delete failed',
                    });
                  });
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function errorEventOf(run: FeedRun): { runId: string; seq: number } | undefined {
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index];
    if (!event || (event.type !== 'error' && event.type !== 'run.failed')) {
      continue;
    }
    const eventRunId = event.runId ?? run.runId;
    if (typeof eventRunId !== 'string' || typeof event.seq !== 'number') {
      continue;
    }
    return { runId: eventRunId, seq: event.seq };
  }
  return undefined;
}
