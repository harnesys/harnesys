import {
  BoxesIcon,
  BugIcon,
  FlagIcon,
  FolderKanbanIcon,
  LayoutListIcon,
  ListChecksIcon,
  type LucideIcon,
  RocketIcon,
  SquareKanbanIcon,
  TargetIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react';

export interface BoardIconOption {
  name: string;
  icon: LucideIcon;
}

export const BOARD_ICON_OPTIONS: BoardIconOption[] = [
  { name: 'square-kanban', icon: SquareKanbanIcon },
  { name: 'folder-kanban', icon: FolderKanbanIcon },
  { name: 'list-checks', icon: ListChecksIcon },
  { name: 'layout-list', icon: LayoutListIcon },
  { name: 'users', icon: UsersIcon },
  { name: 'boxes', icon: BoxesIcon },
  { name: 'bug', icon: BugIcon },
  { name: 'rocket', icon: RocketIcon },
  { name: 'target', icon: TargetIcon },
  { name: 'flag', icon: FlagIcon },
  { name: 'wrench', icon: WrenchIcon },
  { name: 'zap', icon: ZapIcon },
];

const BOARD_ICON_BY_NAME: Record<string, LucideIcon> = {
  ...Object.fromEntries(BOARD_ICON_OPTIONS.map((option) => [option.name, option.icon])),
  'kanban-square': SquareKanbanIcon,
};

export function resolveBoardIcon(name: string | null | undefined): LucideIcon {
  if (!name) {
    return SquareKanbanIcon;
  }
  return BOARD_ICON_BY_NAME[name] ?? SquareKanbanIcon;
}

export const DEFAULT_BOARD_ICON = 'square-kanban';
