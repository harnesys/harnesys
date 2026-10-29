import type { CatalogItem } from '@harnesys/contracts';
import { BotIcon, UsersIcon } from 'lucide-react';
import { softTint } from '@/shared/lib/color';
import { cn } from '@/shared/lib/utils';
import {
  catalogRoleLabel,
  PRESET_KIND_COLORS,
  PRESET_ORIGIN_COLORS,
  presetOriginLabel,
} from '../model/preset-mappers';

export interface PresetCardProps {
  item: CatalogItem;
  onOpen: () => void;
  selected?: boolean;
}

export function PresetCard({ item, onOpen, selected = false }: PresetCardProps) {
  const Icon = item.kind === 'team' ? UsersIcon : BotIcon;
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border bg-popover p-3.5 text-left outline-none transition-all hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50',
        selected && 'ring-2 ring-live',
      )}
      data-testid={`preset-card-${item.id}`}
      onClick={onOpen}
    >
      <span className="flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: softTint(PRESET_KIND_COLORS[item.kind]),
            color: PRESET_KIND_COLORS[item.kind],
          }}
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{item.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{metaLine(item)}</span>
        </span>
      </span>
      {item.description ? (
        <span className="line-clamp-2 text-muted-foreground text-xs">{item.description}</span>
      ) : null}
      <span className="mt-auto flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: PRESET_ORIGIN_COLORS[item.origin] }}
          />
          {presetOriginLabel(item.origin)}
        </span>
        {item.author ? (
          <span className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
            {item.author}
          </span>
        ) : null}
        <span className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
          v{item.version}
        </span>
        {item.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}

function metaLine(item: CatalogItem): string {
  if (item.kind === 'agent') {
    return catalogRoleLabel(item);
  }
  const count = item.roles.length;
  return `${count} ${count === 1 ? 'role' : 'roles'}`;
}
