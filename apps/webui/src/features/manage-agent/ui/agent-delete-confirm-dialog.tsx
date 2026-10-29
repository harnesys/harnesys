import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

export function AgentDeleteConfirmDialog({
  open,
  agentName,
  onSettle,
}: {
  open: boolean;
  agentName?: string;
  onSettle: (confirmed: boolean) => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onSettle(false);
        }
      }}
    >
      <AlertDialogContent size="sm" data-testid="delete-agent-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {agentName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Threads and messages for this agent are deleted from Studio. The project folder on disk
            stays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onSettle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onSettle(true)}>
            Delete agent
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
