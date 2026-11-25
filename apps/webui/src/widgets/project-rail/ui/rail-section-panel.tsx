import { ScrollArea } from '@/shared/ui/scroll-area';
import { SECTION_META, type SectionParts, type SidebarSectionId } from '@/widgets/project-sidebar';

export function RailSectionPanel({
  id,
  parts,
  width,
}: {
  id: SidebarSectionId;
  parts: SectionParts;
  width: number;
}) {
  const label = SECTION_META[id].label;
  return (
    <section
      aria-label={label}
      data-testid={`rail-panel-${id}`}
      style={{ width }}
      className="flex min-h-0 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-2 pl-3">
        <span className="flex size-4 shrink-0 items-center justify-center text-sidebar-foreground/60 [&>svg]:size-4">
          {parts.icon}
        </span>
        <span className="min-w-0 truncate font-medium text-[13px]">{parts.title}</span>
        {parts.count !== undefined && parts.count > 0 ? (
          <span className="shrink-0 text-sidebar-foreground/50 text-xs tabular-nums">
            {parts.count}
          </span>
        ) : null}
        {parts.badge ? (
          <span className="flex shrink-0 items-center gap-1">{parts.badge}</span>
        ) : null}
        {parts.actions ? (
          <span className="ml-auto flex shrink-0 items-center gap-1">{parts.actions}</span>
        ) : null}
      </header>
      <ScrollArea
        className="min-h-0 flex-1"
        horizontal={parts.horizontalScroll}
        data-testid={`rail-panel-content-${id}`}
      >
        <div className="px-2 pt-1 pb-2">{parts.content}</div>
      </ScrollArea>
    </section>
  );
}
