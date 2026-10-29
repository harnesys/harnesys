import { BrainIcon, FolderGit2Icon, FolderIcon } from 'lucide-react';
import type { SettingsNavGroup } from '@/shared/config/settings-nav';

export type ProjectSettingsGroupId = 'source' | 'data';
export type ProjectSettingsCategory = 'general' | 'git' | 'knowledge';

export const PROJECT_SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    id: 'source',
    label: 'Source',
    items: [
      {
        id: 'general',
        label: 'General',
        description: 'Name, visibility, and lifecycle for this source.',
        icon: FolderIcon,
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        id: 'git',
        label: 'Git',
        description: 'Repository state and file decorations.',
        icon: FolderGit2Icon,
      },
      {
        id: 'knowledge',
        label: 'Knowledge',
        description: 'Indexed knowledge for this source.',
        icon: BrainIcon,
      },
    ],
  },
];
