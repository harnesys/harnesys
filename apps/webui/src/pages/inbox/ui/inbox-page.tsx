import { ArrowLeftIcon, InboxIcon } from 'lucide-react';
import { InboxBoard } from '@/features/manage-inbox';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';

export function InboxPage() {
  const { openDesk } = useStudioNavigation();
  return (
    <div className="flex h-svh min-h-0 w-full flex-col bg-background" data-testid="inbox-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            openDesk();
          }}
          data-testid="inbox-back"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to desk
        </Button>
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <InboxIcon className="size-4" />
          Inbox
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
          <InboxBoard />
        </div>
      </div>
    </div>
  );
}
