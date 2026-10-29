import {
  BellIcon,
  BlocksIcon,
  BracesIcon,
  Building2Icon,
  CableIcon,
  ChartColumnIcon,
  CircleDotIcon,
  CircleUserIcon,
  CodeIcon,
  CpuIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayersIcon,
  type LucideIcon,
  MessageSquareIcon,
  PackageIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerIcon,
  SunIcon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react';

export const WINDOW_SETTINGS_CATEGORIES = [
  'appearance',
  'chat',
  'editor',
  'notifications',
  'account',
  'skills',
  'mcp',
  'modes',
  'plugins',
  'packages',
  'lsp',
  'browser',
  'fleet',
  'profiles',
  'providers',
  'connectors',
  'secrets',
  'general',
  'members',
  'usage',
  'audit',
] as const;
export type WindowSettingsCategory = (typeof WINDOW_SETTINGS_CATEGORIES)[number];

export interface SettingsNavItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
}
export interface SettingsNavGroup {
  id: string;
  label?: string;
  items: SettingsNavItem[];
}

export const WINDOW_SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      {
        id: 'appearance',
        label: 'Appearance',
        description: 'Theme, scale, accent, and git status colors.',
        icon: SunIcon,
      },
      {
        id: 'chat',
        label: 'Chat',
        description: 'Font size, follow mode, detail mode, and detailed stats.',
        icon: MessageSquareIcon,
      },
      {
        id: 'editor',
        label: 'Editor',
        description: 'Font, tabs, wrapping, minimap, and whitespace for the code editor.',
        icon: CodeIcon,
      },
      {
        id: 'notifications',
        label: 'Notifications',
        description: 'Sound alerts for approval requests.',
        icon: BellIcon,
      },
    ],
  },
  {
    id: 'account',
    items: [
      {
        id: 'account',
        label: 'Account',
        description: 'Password and sessions for this user on this host.',
        icon: CircleUserIcon,
      },
    ],
  },
  {
    id: 'agent-setup',
    label: 'Agent setup',
    items: [
      {
        id: 'skills',
        label: 'Skills',
        description: 'Organization skills (SKILL.md under org skills dir).',
        icon: WrenchIcon,
      },
      {
        id: 'mcp',
        label: 'MCP',
        description: 'Organization MCP servers in mcp.json.',
        icon: PuzzleIcon,
      },
      {
        id: 'modes',
        label: 'Mode presets',
        description: 'Permission and pack presets for agent modes.',
        icon: CircleDotIcon,
      },
      {
        id: 'plugins',
        label: 'Plugins',
        description: 'Organization plugins under pluginsDir / plugins-data.',
        icon: BlocksIcon,
      },
      {
        id: 'packages',
        label: 'Packages',
        description: 'Capability packs and tool catalog for this organization.',
        icon: PackageIcon,
      },
      {
        id: 'lsp',
        label: 'LSP',
        description: 'Organization language server defaults (lsp.json).',
        icon: BracesIcon,
      },
      {
        id: 'browser',
        label: 'Browser',
        description: 'Browser engines for the browser pack: install per host, org default.',
        icon: GlobeIcon,
      },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      {
        id: 'fleet',
        label: 'Fleet',
        description: 'Machines in this organization and their sync status.',
        icon: ServerIcon,
      },
      {
        id: 'profiles',
        label: 'Execution',
        description: 'Pools of hosts where agents are allowed to run.',
        icon: LayersIcon,
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    items: [
      {
        id: 'providers',
        label: 'Providers',
        description: 'LLM and embedding providers for this organization.',
        icon: CpuIcon,
      },
      {
        id: 'connectors',
        label: 'Connectors',
        description: 'Google Drive, Calendar, and Gmail connections for agents.',
        icon: CableIcon,
      },
      {
        id: 'secrets',
        label: 'Secrets',
        description: 'Organization secrets and variables for MCP and integrations.',
        icon: KeyRoundIcon,
      },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    items: [
      {
        id: 'general',
        label: 'General',
        description: 'Organization name, description, leave, and delete.',
        icon: Building2Icon,
      },
      {
        id: 'members',
        label: 'Members',
        description: 'People in this organization and invite codes for new members.',
        icon: UsersIcon,
      },
      {
        id: 'usage',
        label: 'Usage',
        description: 'Usage and budgets for this organization.',
        icon: ChartColumnIcon,
      },
      {
        id: 'audit',
        label: 'Audit',
        description: 'Security and fleet events for this organization.',
        icon: ScrollTextIcon,
      },
    ],
  },
];

export function findSettingsItem(id: string): SettingsNavItem | undefined {
  for (const group of WINDOW_SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) {
        return item;
      }
    }
  }
  return undefined;
}
