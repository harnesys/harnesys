import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import type { SectionSignal, SectionSignals } from '../model/section-signals';
import { SectionLiveDot, SectionSignalBadge } from './section-signal';
import { SECTION_META, type SidebarSectionId } from './sections-meta';

export interface SectionParts {
  icon: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  horizontalScroll?: boolean;
  content: ReactNode;
}

export function SectionRail({
  ids,
  parts,
  signals,
}: {
  ids: SidebarSectionId[];
  parts: (id: SidebarSectionId) => SectionParts;
  signals: SectionSignals;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 pb-2" data-testid="section-rail">
      {ids.map((id) => {
        const spec = parts(id);
        return (
          <SectionRailButton
            key={id}
            id={id}
            icon={spec.icon}
            content={spec.content}
            actions={spec.actions}
            headerBadge={spec.badge}
            signal={signals[id]}
          />
        );
      })}
    </div>
  );
}

function SectionRailButton({
  id,
  icon,
  content,
  actions,
  headerBadge,
  signal,
}: {
  id: SidebarSectionId;
  icon: ReactNode;
  content: ReactNode;
  actions?: ReactNode;
  headerBadge?: ReactNode;
  signal?: SectionSignal;
}) {
  const label = SECTION_META[id].label;
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label={label}
            data-testid={`section-rail-${id}`}
            className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
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
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className="flex max-h-[70vh] min-h-56 w-80 flex-col overflow-hidden p-0"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
            {icon}
          </span>
          <span className="min-w-0 truncate font-medium text-[13px]">{label}</span>
          {headerBadge || actions ? (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {headerBadge}
              {actions}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">{content}</div>
      </HoverCardContent>
    </HoverCard>
  );
}
