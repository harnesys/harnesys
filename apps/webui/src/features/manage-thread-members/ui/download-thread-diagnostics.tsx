import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import type { Thread } from '@/entities/thread';
import { downloadThreadExport } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

export function DownloadThreadDiagnostics({ thread }: { thread: Thread }) {
  const [pending, setPending] = useState(false);
  const download = () => {
    setPending(true);
    void downloadThreadExport(thread.id)
      .catch((error: unknown) => {
        toast.add({
          title: 'Could not download thread',
          description: error instanceof Error ? error.message : 'Request failed',
        });
      })
      .finally(() => setPending(false));
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      disabled={pending}
      aria-label="Download thread diagnostics"
      title="Download thread diagnostics"
      data-testid="thread-download-diagnostics"
      onClick={download}
    >
      <DownloadIcon className="size-3" />
      Download diagnostics
    </Button>
  );
}
