import { GitBranchIcon } from 'lucide-react';
import { useOpenThreadTab } from '@/features/ide';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
export interface BranchChild {
  id: string;
  agentId: string;
  title: string;
}
export function BranchPointBadge({ runId, branches }: { runId: string; branches: BranchChild[] }) {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const openThreadTab = useOpenThreadTab();
  const first = branches[0];
  if (!first) {
    return null;
  }
  const titles = branches.map((branch) => branch.title).join('\n');
  return (
    <button
      type="button"
      data-testid={`branch-point-${runId}`}
      title={titles}
      aria-label={`Open branch: ${first.title}`}
      className="pointer-events-auto inline-flex items-center gap-1 rounded-md text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        if (!projectId) {
          return;
        }
        openThreadTab(projectId, first.agentId, first.id);
      }}
    >
      <GitBranchIcon className="size-3 shrink-0" />
      <span>{branches.length}</span>
    </button>
  );
}
