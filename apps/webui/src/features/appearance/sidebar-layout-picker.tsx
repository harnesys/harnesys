import { CheckIcon, type LucideIcon, PanelLeftDashedIcon, PanelLeftIcon } from 'lucide-react';
import {
  UI_SIDEBAR_LAYOUT_LABELS,
  UI_SIDEBAR_LAYOUTS,
  type UiSidebarLayout,
} from '@/shared/lib/appearance';
import { cn } from '@/shared/lib/utils';
import { useTheme } from '@/shared/ui/theme-provider';

const LAYOUT_ICONS: Record<UiSidebarLayout, LucideIcon> = {
  classic: PanelLeftIcon,
  rail: PanelLeftDashedIcon,
};

const LAYOUT_DESCRIPTIONS: Record<UiSidebarLayout, string> = {
  classic: 'Every section stacked in one sidebar.',
  rail: 'Icon bar with one section docked.',
};

export function SidebarLayoutPicker() {
  const { sidebarLayout, setSidebarLayout } = useTheme();
  return (
    <div className="grid max-w-md grid-cols-2 gap-2" data-testid="sidebar-layout-select">
      {UI_SIDEBAR_LAYOUTS.map((layout) => {
        const selected = sidebarLayout === layout;
        const Icon = LAYOUT_ICONS[layout];
        return (
          <button
            key={layout}
            type="button"
            aria-pressed={selected}
            aria-label={`${UI_SIDEBAR_LAYOUT_LABELS[layout]}: ${LAYOUT_DESCRIPTIONS[layout]}`}
            data-testid={`sidebar-layout-${layout}`}
            onClick={() => setSidebarLayout(layout)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border bg-transparent p-1.5 text-left outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected ? 'border-live' : 'border-border hover:border-foreground/25',
            )}
          >
            <span className="relative block h-16 w-full overflow-hidden rounded-md border border-border">
              <SidebarLayoutPreview layout={layout} />
            </span>
            <span className="flex w-full items-center gap-1.5 px-0.5 text-sm">
              <Icon className="size-3.5 text-muted-foreground" />
              {UI_SIDEBAR_LAYOUT_LABELS[layout]}
              {selected ? <CheckIcon className="ml-auto size-3.5 text-live" /> : null}
            </span>
            <span className="px-0.5 pb-0.5 text-muted-foreground text-xs leading-4">
              {LAYOUT_DESCRIPTIONS[layout]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SidebarLayoutPreview({ layout }: { layout: UiSidebarLayout }) {
  if (layout === 'classic') {
    return <ClassicLayoutPreview />;
  }
  return <RailLayoutPreview />;
}

function ClassicLayoutPreview() {
  return (
    <span aria-hidden className="absolute inset-0 flex bg-background">
      <span className="flex w-[40%] flex-col gap-1 border-border border-r bg-sidebar p-1.5">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] bg-live/70" />
          <span className="h-1 w-6 rounded-full bg-foreground/25" />
        </span>
        <span className="mt-1 flex flex-col gap-1">
          <span className="h-1 w-full rounded-full bg-foreground/15" />
          <span className="h-1 w-5/6 rounded-full bg-foreground/15" />
          <span className="h-1 w-4/5 rounded-full bg-foreground/15" />
          <span className="h-1 w-3/5 rounded-full bg-foreground/15" />
        </span>
        <span className="mt-auto flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-foreground/20" />
          <span className="size-1.5 rounded-full bg-foreground/20" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
        <span className="h-1 w-2/3 rounded-full bg-foreground/20" />
        <span className="h-1 w-1/2 rounded-full bg-foreground/10" />
        <span className="mt-auto h-1 w-1/3 rounded-full bg-live/60" />
      </span>
    </span>
  );
}

function RailLayoutPreview() {
  return (
    <span aria-hidden className="absolute inset-0 flex bg-background">
      <span className="flex w-[18%] flex-col items-center gap-1 border-border border-r bg-sidebar p-1">
        <span className="size-2.5 rounded-[3px] bg-live/70" />
        <span className="mt-1 size-1.5 rounded-[2px] bg-live/70" />
        <span className="size-1.5 rounded-[2px] bg-foreground/20" />
        <span className="size-1.5 rounded-[2px] bg-foreground/20" />
        <span className="mt-auto size-1.5 rounded-full bg-foreground/20" />
      </span>
      <span className="flex w-[36%] flex-col gap-1 border-border border-r bg-sidebar p-1.5">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-[2px] bg-foreground/25" />
          <span className="h-1 w-6 rounded-full bg-foreground/25" />
        </span>
        <span className="mt-1 h-1 w-full rounded-full bg-foreground/15" />
        <span className="h-1 w-4/5 rounded-full bg-foreground/15" />
        <span className="h-1 w-2/3 rounded-full bg-foreground/15" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
        <span className="h-1 w-3/4 rounded-full bg-foreground/15" />
        <span className="mt-auto h-1 w-1/2 rounded-full bg-live/60" />
      </span>
    </span>
  );
}
