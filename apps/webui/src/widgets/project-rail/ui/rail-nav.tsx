import type { EntityColorName } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { SECTION_META, type SidebarSectionId } from '@/widgets/project-sidebar';

const SECTION_TINTS: Record<SidebarSectionId, EntityColorName> = {
  inbox: 'orange',
  agents: 'purple',
  channels: 'cyan',
  issues: 'blue',
  projects: 'green',
  dashboards: 'magenta',
  automations: 'yellow',
  git: 'red',
  terminal: 'pink',
};

export function RailNavButton({
  id,
  icon,
  count,
  attention,
  active,
  onSelect,
}: {
  id: SidebarSectionId;
  icon: ReactNode;
  count?: number;
  attention?: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const label = SECTION_META[id].label;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            data-testid={`rail-section-${id}`}
            onClick={onSelect}
            className={cn(
              'relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              active
                ? entityColorTintClass(SECTION_TINTS[id])
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          />
        }
      >
        <span className="flex items-center justify-center [&>svg]:size-4">{icon}</span>
        {count !== undefined && count > 0 ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sidebar-accent px-0.5 font-medium text-[9px] text-sidebar-accent-foreground tabular-nums leading-none ring-2 ring-sidebar">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
        {attention ? (
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-live ring-2 ring-sidebar" />
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
