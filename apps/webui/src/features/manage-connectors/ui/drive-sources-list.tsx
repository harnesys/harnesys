import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, LoaderCircleIcon, RefreshCwIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { orgSourcesQueryKey } from '@/features/manage-connectors/model/drive-sources';
import { selfNodeCached } from '@/shared/api/fleet';
import { refreshCloudDrive, type Source } from '@/shared/api/sources';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { FolderTypeIcon } from '@/shared/ui/icons';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { useExplorerExpandStore } from '@/widgets/project-sidebar/model/explorer-expand.store';
import { CONNECTOR_INSET_CLASSES } from './connector-card';

interface DriveSourcesListProps {
  orgId: string;
  sources: Source[] | undefined;
  loading: boolean;
}

export function DriveSourcesList({ orgId, sources, loading }: DriveSourcesListProps) {
  const navigate = useNavigate();
  const openSource = (sourceId: string) => {
    const { roots, toggleRoot } = useExplorerExpandStore.getState();
    if (roots[sourceId] !== true) {
      toggleRoot(sourceId);
    }
    void navigate(studioPath.desk(orgId));
  };
  if (loading) {
    return <RowListSkeleton rows={2} testId="connectors-drive-sources-loading" />;
  }
  if (!sources || sources.length === 0) {
    return (
      <p className="py-1 text-muted-foreground text-xs">No Drive sources from this account yet.</p>
    );
  }
  return (
    <div className={`${CONNECTOR_INSET_CLASSES} flex flex-col divide-y divide-border/40`}>
      {sources.map((source) => (
        <DriveSourceRow
          key={source.id}
          orgId={orgId}
          source={source}
          onOpen={() => {
            openSource(source.id);
          }}
        />
      ))}
    </div>
  );
}

interface DriveSourceRowProps {
  orgId: string;
  source: Source;
  onOpen: () => void;
}

function DriveSourceRow({ orgId, source, onOpen }: DriveSourceRowProps) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => {
      const hostId = selfNodeCached();
      if (!hostId) {
        throw new Error('Host id is required');
      }
      return refreshCloudDrive(orgId, source.id, hostId);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: orgSourcesQueryKey(orgId) });
      void queryClient.invalidateQueries({
        queryKey: ['source-file-content', source.id],
      });
      if (result.conflicts.length > 0) {
        toast.add({
          title: 'Synced with conflicts',
          description:
            `${result.conflicts.length} conflict ${result.conflicts.length === 1 ? 'copy' : 'copies'} ` +
            'saved next to the originals (both versions kept).',
        });
        return;
      }
      toast.add({ title: `${source.name} synced` });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.add({ title: 'Sync failed', description: msg });
    },
  });
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      data-testid={`connectors-drive-source-${source.id}`}
    >
      <FolderTypeIcon size="xs" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{source.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={`Sync ${source.name} with Google Drive`}
        data-testid={`connectors-drive-source-sync-${source.id}`}
        disabled={sync.isPending}
        onClick={() => {
          sync.mutate();
        }}
      >
        {sync.isPending ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={`Open ${source.name} on the desk`}
        data-testid={`connectors-drive-source-open-${source.id}`}
        onClick={onOpen}
      >
        <ExternalLinkIcon />
      </Button>
    </div>
  );
}
