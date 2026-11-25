import type { SidebarSectionId } from '@/widgets/project-sidebar';

export const SECTION_TINTS: Record<SidebarSectionId, string> = {
  inbox: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  agents: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  channels: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  issues: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  projects: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  dashboards: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  automations: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  git: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  terminal: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};
