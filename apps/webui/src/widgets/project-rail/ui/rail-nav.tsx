import type { EntityColorName } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  SECTION_META,
  SectionLiveDot,
  type SectionSignal,
  SectionSignalBadge,
  type SidebarSectionId,
} from '@/widgets/project-sidebar';

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
  signal,
  active,
  onSelect,
}: {
  id: SidebarSectionId;
  icon: ReactNode;
  signal?: SectionSignal;
  active: boolean;
  onSelect: () => void;
}) {
  const label = SECTION_META[id].label;
  const status = signal
    ? [
        signal.live ? 'working now' : null,
        signal.attention > 0 ? `${signal.attention} pending` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={status ? `${label}, ${status}` : label}
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
        {signal?.attention ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex">
            <SectionSignalBadge signal={signal} />
          </span>
        ) : null}
        {signal?.live ? <SectionLiveDot /> : null}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        <span className="flex flex-col">
          <span>{label}</span>
          {status ? (
            <span className="text-[10px] text-muted-foreground leading-tight">{status}</span>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
