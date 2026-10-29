import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon, LoaderCircleIcon, PlusIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useProjects } from '@/entities/project';
import { openAddSourceDialog } from '@/features/attach-source';
import { patchKnowledgeIndexState } from '@/features/manage-knowledge-index/model/patch-knowledge-index-state';
import { getActiveOrgId } from '@/shared/api/active-org';
import { watchKnowledgeIndexStates } from '@/shared/api/events';
import { selfNodeCached } from '@/shared/api/fleet';
import {
  knowledgeIndexStateQueryKey,
  knowledgeIndexStatesQuery,
} from '@/shared/api/knowledge-index';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
} from '@/shared/ui/dropdown-menu';
import { useExplorerHiddenStore } from '../model/explorer-hidden.store';
import { useHiddenSourceIds, useSourceVisibilityStore } from '../model/source-visibility.store';
import { SectionMenu } from './section-menu';
import { SourceRootIcon } from './source-root-icon';

export function ProjectsTitle() {
  const orgId = getActiveOrgId() ?? '';
  const queryClient = useQueryClient();
  const { data: indexStates } = useQuery({
    ...knowledgeIndexStatesQuery(orgId),
    enabled: Boolean(orgId),
  });
  useEffect(() => {
    if (!(orgId && indexStates)) {
      return;
    }
    for (const state of indexStates) {
      queryClient.setQueryData(knowledgeIndexStateQueryKey(orgId, state.sourceId), state);
    }
  }, [orgId, indexStates, queryClient]);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchKnowledgeIndexStates((sourceId, state) => {
      patchKnowledgeIndexState(queryClient, orgId, sourceId, state);
    });
  }, [orgId, queryClient]);
  const isIndexing = indexStates?.some((state) => state.status === 'running') ?? false;
  return (
    <span className="flex items-center gap-1.5">
      Sources
      {isIndexing ? (
        <LoaderCircleIcon
          className="size-3.5 animate-spin text-muted-foreground"
          data-testid="files-indexing"
          aria-label="Indexing"
        />
      ) : null}
    </span>
  );
}
export function ProjectsActions() {
  const orgId = getActiveOrgId() ?? '';
  const showHidden = useExplorerHiddenStore((state) => state.showHidden);
  const setShowHidden = useExplorerHiddenStore((state) => state.setShowHidden);
  const { data: projects } = useProjects();
  const sources = projects ?? [];
  const hidden = useHiddenSourceIds(orgId);
  const toggleHidden = useSourceVisibilityStore((state) => state.toggleHidden);
  const showAll = useSourceVisibilityStore((state) => state.showAll);
  return (
    <SectionMenu label="Sources actions" contentClassName="min-w-44">
      <DropdownMenuGroup>
        <DropdownMenuItem
          data-testid="projects-add-project"
          onClick={() => {
            void openAddSourceDialog();
          }}
        >
          <PlusIcon className="size-3" />
          Add source
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {sources.length > 0 ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <div className="flex items-center justify-between pr-2">
              <DropdownMenuLabel>In this section</DropdownMenuLabel>
              {hidden.length > 0 ? (
                <DropdownMenuItem
                  data-testid="projects-show-all-sources"
                  className="h-auto px-1.5 py-0.5 text-[10px] focus:bg-transparent"
                  onClick={() => {
                    showAll(orgId);
                  }}
                >
                  Show all
                </DropdownMenuItem>
              ) : null}
            </div>
            {sources.map((source) => {
              const isVisible = !hidden.includes(source.id);
              return (
                <DropdownMenuSwitchItem
                  key={source.id}
                  data-testid={`projects-source-visibility-${source.id}`}
                  checked={isVisible}
                  onCheckedChange={(checked) => {
                    toggleHidden(orgId, source.id, !checked);
                  }}
                >
                  <SourceRootIcon
                    driver={source.driver}
                    hasGit={source.hasGit === true}
                    hasRemote={source.gitRemote != null}
                    managed={source.managed === true}
                    isLocal={source.hostId != null && source.hostId === selfNodeCached()}
                    open={false}
                  />
                  <span className="min-w-0 flex-1 truncate">{source.name}</span>
                </DropdownMenuSwitchItem>
              );
            })}
          </DropdownMenuGroup>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuSwitchItem checked={showHidden} onCheckedChange={setShowHidden}>
          {showHidden ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
          {showHidden ? 'Hide hidden files' : 'Show hidden files'}
        </DropdownMenuSwitchItem>
      </DropdownMenuGroup>
    </SectionMenu>
  );
}

export { ProjectRootMenu } from './project-root-menu';
export { ProjectsTrees } from './projects-trees';
