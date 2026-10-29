import type { ProjectSettingsCategory } from '../model/project-settings-nav.ts';
import { GeneralPane } from './general-pane';
import { GitPane } from './git-pane';
import { MemoryPane } from './memory-pane';

export function ProjectSettingsCategoryPanes({
  category,
  projectId,
  onClose,
}: {
  category: ProjectSettingsCategory;
  projectId: string;
  onClose: () => void;
}) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div
        className="flex min-w-0 flex-col gap-4 pr-3 pl-0.5"
        data-testid={`project-settings-pane-${category}`}
      >
        <CategoryPane category={category} projectId={projectId} onClose={onClose} />
      </div>
    </div>
  );
}

function CategoryPane({
  category,
  projectId,
  onClose,
}: {
  category: ProjectSettingsCategory;
  projectId: string;
  onClose: () => void;
}) {
  switch (category) {
    case 'general':
      return <GeneralPane projectId={projectId} onClose={onClose} />;
    case 'git':
      return <GitPane projectId={projectId} />;
    case 'knowledge':
      return <MemoryPane projectId={projectId} />;
  }
}
