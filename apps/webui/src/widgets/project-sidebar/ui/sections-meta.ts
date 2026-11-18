import {
  CpuIcon,
  GitBranchIcon,
  HardDriveIcon,
  HashIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  SquareKanbanIcon,
  SquareTerminalIcon,
  ZapIcon,
} from 'lucide-react';
export type SidebarSectionId =
  | 'inbox'
  | 'agents'
  | 'channels'
  | 'issues'
  | 'projects'
  | 'dashboards'
  | 'automations'
  | 'git'
  | 'terminal';
export const SECTION_META: Record<
  SidebarSectionId,
  {
    label: string;
    icon: LucideIcon;
  }
> = {
  inbox: { label: 'Inbox', icon: InboxIcon },
  agents: { label: 'Agents', icon: CpuIcon },
  channels: { label: 'Channels', icon: HashIcon },
  issues: { label: 'Issues', icon: SquareKanbanIcon },
  projects: { label: 'Sources', icon: HardDriveIcon },
  dashboards: { label: 'Dashboards', icon: LayoutDashboardIcon },
  automations: { label: 'Automations', icon: ZapIcon },
  git: { label: 'Git', icon: GitBranchIcon },
  terminal: { label: 'Terminal', icon: SquareTerminalIcon },
};
