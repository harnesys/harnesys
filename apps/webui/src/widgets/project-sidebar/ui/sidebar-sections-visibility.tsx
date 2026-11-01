import { GalleryVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenuButton } from '@/shared/ui/sidebar';
import { useAccordionStore } from '../model/accordion.store';
import { hasHiddenAttention, useSectionAttention } from '../model/section-attention';
import { SECTION_META, type SidebarSectionId } from './sections-meta';

export function SidebarSectionsVisibility() {
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const setVisibility = useAccordionStore((state) => state.setVisibility);
  const attention = useSectionAttention();
  const sections = ['inbox', ...order] as SidebarSectionId[];
  const showAttention = hasHiddenAttention(sections, hidden, attention);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground"
        render={
          <SidebarMenuButton
            tooltip="Sections visibility"
            aria-label="Toggle sections visibility"
            data-testid="nav-sections-visibility"
            className="w-auto"
          />
        }
      >
        <span className="relative inline-flex">
          <GalleryVertical />
          {showAttention ? (
            <span
              className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-live"
              data-testid="nav-sections-attention"
            />
          ) : null}
        </span>
        <span className="sr-only">Sections visibility</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sections</DropdownMenuLabel>
          {sections.map((id) => {
            const meta = SECTION_META[id];
            if (!meta) {
              return null;
            }
            const Icon = meta.icon;
            return (
              <DropdownMenuSwitchItem
                key={id}
                data-testid={`nav-section-visibility-${id}`}
                checked={!hidden[id]}
                onCheckedChange={(checked) => setVisibility(id, Boolean(checked))}
              >
                <Icon className="size-3" />
                <span className="min-w-0 flex-1 truncate">{meta.label}</span>
              </DropdownMenuSwitchItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
