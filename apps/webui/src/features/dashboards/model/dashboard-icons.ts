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

export interface DashboardIconOption {
  name: string;
  icon: LucideIcon;
}

export const DASHBOARD_ICON_OPTIONS: DashboardIconOption[] = [
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

const DASHBOARD_ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  DASHBOARD_ICON_OPTIONS.map((option) => [option.name, option.icon]),
);

export function resolveDashboardIcon(name: string | null | undefined): LucideIcon {
  if (!name) {
    return LayoutDashboardIcon;
  }
  return DASHBOARD_ICON_BY_NAME[name] ?? LayoutDashboardIcon;
}

export const DEFAULT_DASHBOARD_ICON = 'layout-dashboard';
