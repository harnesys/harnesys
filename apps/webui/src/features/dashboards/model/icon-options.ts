import {
  ActivityIcon,
  BarChart3Icon,
  BoxesIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  type LucideIcon,
  PieChartIcon,
  RocketIcon,
  ServerIcon,
  TargetIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react';

export interface IconOption {
  name: string;
  icon: LucideIcon;
}

/** Icon names shared by dashboards and widgets; the stored value is the name. */
export const ICON_OPTIONS: IconOption[] = [
  { name: 'layout-dashboard', icon: LayoutDashboardIcon },
  { name: 'activity', icon: ActivityIcon },
  { name: 'bar-chart', icon: BarChart3Icon },
  { name: 'line-chart', icon: LineChartIcon },
  { name: 'pie-chart', icon: PieChartIcon },
  { name: 'workflow', icon: WorkflowIcon },
  { name: 'server', icon: ServerIcon },
  { name: 'boxes', icon: BoxesIcon },
  { name: 'zap', icon: ZapIcon },
  { name: 'target', icon: TargetIcon },
  { name: 'rocket', icon: RocketIcon },
];

const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((option) => [option.name, option.icon]),
);

/** The named icon, or null when the name is absent or unknown. */
export function findIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) {
    return null;
  }
  return ICON_BY_NAME[name] ?? null;
}

export function resolveIcon(name: string | null | undefined): LucideIcon {
  return findIcon(name) ?? LayoutDashboardIcon;
}

export const DEFAULT_ICON = 'layout-dashboard';
