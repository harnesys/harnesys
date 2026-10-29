import { SquareIcon } from 'lucide-react';
import { type InboxApprovalRecord, parksRun } from '@/entities/approval';
import { Button } from '@/shared/ui/button';
import { useStopRun } from '../model/use-inbox';

export function InboxStopRunButton({ approval }: { approval: InboxApprovalRecord }) {
  const stopRun = useStopRun();
  if (!parksRun(approval)) {
    return null;
  }
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={stopRun.isPending}
      onClick={() => {
        if (approval.threadId === null) {
          return;
        }
        stopRun.mutate({ threadId: approval.threadId, runId: approval.runId });
      }}
      data-testid="inbox-stop-run"
    >
      <SquareIcon data-icon="inline-start" />
      Stop run
    </Button>
  );
}
