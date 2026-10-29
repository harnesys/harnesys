import {
  GitBranchIcon,
  HardDriveIcon,
  InboxIcon,
  type LucideIcon,
  SparkleIcon,
  SquareKanbanIcon,
  SquareTerminalIcon,
  ZapIcon,
} from 'lucide-react';
export type SidebarSectionId =
  | 'inbox'
  | 'agents'
  | 'issues'
  | 'projects'
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
  agents: { label: 'Agents', icon: SparkleIcon },
  issues: { label: 'Issues', icon: SquareKanbanIcon },
  projects: { label: 'Sources', icon: HardDriveIcon },
  automations: { label: 'Automations', icon: ZapIcon },
  git: { label: 'Git', icon: GitBranchIcon },
  terminal: { label: 'Terminal', icon: SquareTerminalIcon },
};
