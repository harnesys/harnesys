import { SettingsNav } from '@/widgets/settings-nav/settings-nav';
import {
  PROJECT_SETTINGS_GROUPS,
  type ProjectSettingsCategory,
} from '../model/project-settings-nav.ts';

export interface ProjectSettingsNavProps {
  category: ProjectSettingsCategory;
  onSelect: (category: ProjectSettingsCategory) => void;
  className?: string;
}
export function ProjectSettingsNav({ category, onSelect, className }: ProjectSettingsNavProps) {
  return (
    <div className={className} data-testid="project-settings-nav">
      <div className="w-full shrink-0 md:w-40">
        <SettingsNav
          groups={PROJECT_SETTINGS_GROUPS}
          active={category}
          onSelect={(id) => onSelect(id as ProjectSettingsCategory)}
          testIdPrefix="project-settings-nav"
        />
      </div>
    </div>
  );
}
