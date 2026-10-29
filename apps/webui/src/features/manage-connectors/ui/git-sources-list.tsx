import { ExternalLinkIcon, FolderGit2Icon } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Source } from '@/shared/api/sources';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RowListSkeleton } from '@/shared/ui/settings-kit';
import { useExplorerExpandStore } from '@/widgets/project-sidebar/model/explorer-expand.store';
import { CONNECTOR_INSET_CLASSES } from './connector-card';

interface GitSourcesListProps {
  orgId: string;
  sources: Source[] | undefined;
  loading: boolean;
}

export function GitSourcesList({ orgId, sources, loading }: GitSourcesListProps) {
  const navigate = useNavigate();
  const openSource = (sourceId: string) => {
    const { roots, toggleRoot } = useExplorerExpandStore.getState();
    if (roots[sourceId] !== true) {
      toggleRoot(sourceId);
    }
    void navigate(studioPath.desk(orgId));
  };
  if (loading) {
    return <RowListSkeleton rows={2} testId="connectors-git-sources-loading" />;
  }
  if (!sources || sources.length === 0) {
    return (
      <p className="py-1 text-muted-foreground text-xs">
        No repositories attached from this account yet.
      </p>
    );
  }
  return (
    <div className={`${CONNECTOR_INSET_CLASSES} flex flex-col divide-y divide-border/40`}>
      {sources.map((source) => (
        <div
          key={source.id}
          className="flex items-center gap-2 px-3 py-1.5"
          data-testid={`connectors-git-source-${source.id}`}
        >
          <FolderGit2Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px]">{source.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Open ${source.name} on the desk`}
            data-testid={`connectors-git-source-open-${source.id}`}
            onClick={() => {
              openSource(source.id);
            }}
          >
            <ExternalLinkIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
