import { GalleryVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarMenuButton } from '@/shared/ui/sidebar';
import { useAccordionStore } from '../model/accordion.store';
import { SECTION_META, type SidebarSectionId } from './sections-meta';

export function SidebarSectionsVisibility() {
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const setVisibility = useAccordionStore((state) => state.setVisibility);
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
        <GalleryVertical />
        <span className="sr-only">Sections visibility</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sections</DropdownMenuLabel>
          {['inbox', ...order].map((id) => {
            const meta = SECTION_META[id as SidebarSectionId];
            if (!meta) {
              return null;
            }
            const Icon = meta.icon;
            return (
              <DropdownMenuCheckboxItem
                key={id}
                checked={!hidden[id]}
                onCheckedChange={(checked) => setVisibility(id, Boolean(checked))}
              >
                <Icon className="size-3" />
                {meta.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
