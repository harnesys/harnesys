import { type MouseEvent as ReactMouseEvent, useState } from 'react';
import { OrgHeader } from '@/features/switch-org';
import { Resizer } from '@/shared/ui/resizer';
import { useSidebar } from '@/shared/ui/sidebar';
import { InboxBell } from '@/widgets/inbox-bell';
import {
  type SectionParts,
  type SidebarSectionId,
  useAccordionStore,
  useSectionAttention,
} from '@/widgets/project-sidebar';
import { isRailSectionId, loadRailSection, saveRailSection } from '../model/rail-selection';
import { useRailParts } from '../model/use-rail-parts';
import { RailFooter } from './rail-footer';
import { RailNavButton } from './rail-nav';
import { RailSectionPanel } from './rail-section-panel';

export function ProjectRail({
  width,
  dragging,
  onResizeStart,
}: {
  width: number;
  dragging: boolean;
  onResizeStart: (event: ReactMouseEvent) => void;
}) {
  const partsFor = useRailParts();
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const attention = useSectionAttention();
  const [selected, setSelected] = useState<SidebarSectionId | null>(loadRailSection);
  const { open, setOpen } = useSidebar();

  const visible: SidebarSectionId[] = [];
  if (!hidden.inbox) {
    visible.push('inbox');
  }
  for (const id of order) {
    if (isRailSectionId(id) && !hidden[id]) {
      visible.push(id);
    }
  }
  const activeId = visible.find((id) => id === selected) ?? visible[0] ?? null;
  const select = (id: SidebarSectionId) => {
    setSelected(id);
    saveRailSection(id);
    setOpen(true);
  };
  const activeParts: SectionParts | null = activeId ? partsFor(activeId) : null;

  return (
    <div className="flex h-full min-h-0 shrink-0" data-testid="project-rail">
      <aside
        className="flex w-12 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground"
        data-testid="project-rail-bar"
      >
        <div className="flex h-10 shrink-0 items-center justify-center">
          <OrgHeader compact avatarClassName="size-7 text-xs" />
        </div>
        <div className="flex shrink-0 items-center justify-center">
          <InboxBell />
        </div>
        <div aria-hidden className="mx-auto my-1.5 h-px w-8 shrink-0 bg-sidebar-border" />
        <nav
          aria-label="Sections"
          className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1 pb-2"
        >
          {visible.map((id) => {
            const parts = partsFor(id);
            return (
              <RailNavButton
                key={id}
                id={id}
                icon={parts.icon}
                count={parts.count}
                attention={attention[id]}
                active={id === activeId}
                onSelect={() => select(id)}
              />
            );
          })}
        </nav>
        <RailFooter />
      </aside>
      {open && activeId && activeParts ? (
        <>
          <RailSectionPanel id={activeId} parts={activeParts} width={width} />
          <Resizer
            label="Resize sidebar"
            testId="rail-sidebar-resize"
            dragging={dragging}
            onResizeStart={onResizeStart}
          />
        </>
      ) : null}
    </div>
  );
}
