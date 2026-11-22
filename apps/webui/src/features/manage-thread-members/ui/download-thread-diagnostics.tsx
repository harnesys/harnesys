import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import type { Thread } from '@/entities/thread';
import { downloadThreadExport } from '@/shared/api';
import { formatBytes } from '@/shared/lib/file-meta';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

export function DownloadThreadDiagnostics({ thread }: { thread: Thread }) {
  const [receivedBytes, setReceivedBytes] = useState<number | null>(null);
  const download = () => {
    setReceivedBytes(0);
    void downloadThreadExport(thread.id, (bytes) => setReceivedBytes(bytes))
      .catch((error: unknown) => {
        toast.add({
          title: 'Could not download thread',
          description: error instanceof Error ? error.message : 'Request failed',
        });
      })
      .finally(() => setReceivedBytes(null));
  };
  const pending = receivedBytes !== null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      aria-label="Download thread diagnostics"
      title="Download thread diagnostics"
      data-testid="thread-download-diagnostics"
      onClick={download}
    >
      {pending ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <DownloadIcon className="size-3" />
      )}
      {pending ? `Exporting… ${formatBytes(receivedBytes ?? 0)}` : 'Download diagnostics'}
    </Button>
  );
}
