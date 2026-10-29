import {
  ArrowLeftIcon,
  BotIcon,
  BrainIcon,
  CableIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  FolderKeyIcon,
  FoldVerticalIcon,
  GaugeIcon,
  LayersIcon,
  type LucideIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  WebhookIcon,
  WorkflowIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SettingsNav } from '@/widgets/settings-nav/settings-nav';
export type AgentConfigCategory =
  | 'identity'
  | 'model'
  | 'access'
  | 'modes'
  | 'capabilities'
  | 'compaction'
  | 'memory'
  | 'execution'
  | 'hooks'
  | 'graph'
  | 'limits'
  | 'subagents'
  | 'connectors';
export interface AgentConfigNavItem {
  id: AgentConfigCategory;
  label: string;
  icon: LucideIcon;
}
export const AGENT_CONFIG_CATEGORIES: AgentConfigNavItem[] = [
  { id: 'identity', label: 'Identity', icon: UserRoundIcon },
  { id: 'model', label: 'Model', icon: CpuIcon },
  { id: 'capabilities', label: 'Capabilities', icon: LayersIcon },
  { id: 'access', label: 'Access & security', icon: FolderKeyIcon },
  { id: 'execution', label: 'Execution', icon: ServerIcon },
  { id: 'limits', label: 'Limits', icon: GaugeIcon },
  { id: 'compaction', label: 'Compaction', icon: FoldVerticalIcon },
  { id: 'memory', label: 'Memory', icon: BrainIcon },
  { id: 'graph', label: 'Graph', icon: WorkflowIcon },
  { id: 'connectors', label: 'Connectors', icon: CableIcon },
  { id: 'subagents', label: 'Subagents', icon: BotIcon },
  { id: 'hooks', label: 'Hooks', icon: WebhookIcon },
  { id: 'modes', label: 'Modes', icon: SlidersHorizontalIcon },
];

export function filterAgentConfigCategories(options: {
  isDelegate: boolean;
  showSubagents: boolean;
}): AgentConfigNavItem[] {
  return AGENT_CONFIG_CATEGORIES.filter((item) => {
    if (
      options.isDelegate &&
      (item.id === 'modes' ||
        item.id === 'hooks' ||
        item.id === 'subagents' ||
        item.id === 'connectors')
    ) {
      return false;
    }
    if (item.id === 'subagents' && !options.showSubagents) {
      return false;
    }
    return true;
  });
}

export function shouldResetAgentConfigCategory(
  category: AgentConfigCategory,
  options: { showSubagents: boolean },
): boolean {
  return category === 'subagents' && !options.showSubagents;
}
export interface AgentConfigCategoryNavProps {
  categories: AgentConfigNavItem[];
  category: AgentConfigCategory;
  onSelect: (category: AgentConfigCategory) => void;
  backLabel?: string | null;
  onBack?: () => void;
  className?: string;
}
export function AgentConfigCategoryNav({
  categories,
  category,
  onSelect,
  backLabel,
  onBack,
  className,
}: AgentConfigCategoryNavProps) {
  return (
    <div className={cn('flex w-40 shrink-0 flex-col', className)}>
      {backLabel != null && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mx-2 mt-1 mb-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-muted-foreground text-sm hover:bg-sidebar-accent/50 hover:text-foreground"
          data-testid="agent-config-back"
        >
          <ArrowLeftIcon className="size-3.5 shrink-0" />
          {backLabel}
        </button>
      ) : null}
      <div className="min-h-0 overflow-y-auto">
        <SettingsNav
          groups={[{ id: 'agent', items: categories }]}
          active={category}
          onSelect={(id) => onSelect(id as AgentConfigCategory)}
          testIdPrefix="agent-config-nav"
          className="md:gap-0.5"
        />
      </div>
    </div>
  );
}
export function GraphContentNavToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Hide sections' : 'Show sections'}
      data-testid="agent-config-graph-nav-toggle"
      className={cn(
        'absolute top-1/2 left-0 z-20 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
        'border border-border/40 bg-popover/95 text-muted-foreground/50 shadow-md backdrop-blur-sm',
        'opacity-50 transition-[opacity,color,border-color] duration-150',
        'hover:border-border hover:text-foreground hover:opacity-100',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {open ? <ChevronLeftIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
    </button>
  );
}
