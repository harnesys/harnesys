import type { PresetDetail, PresetOrigin } from '@harnesys/contracts';
import { BotIcon, ChevronRightIcon, UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EntityMark, EntityTile, EntityTileFooter, EntityTileHead } from '@/shared/ui/entity-tile';
import {
  PRESET_ORIGIN_COLORS,
  presetCapabilityNames,
  presetColorHex,
  presetOriginLabel,
} from '../model/preset-mappers';

export interface PresetCardProps {
  preset: PresetDetail;
  onOpen: () => void;
  selected?: boolean;
}

export function PresetCard({ preset, onOpen, selected = false }: PresetCardProps) {
  const Icon = preset.kind === 'team' ? UsersIcon : BotIcon;
  return (
    <EntityTile
      onClick={onOpen}
      selected={selected}
      pressed={selected}
      expanded={selected}
      testId={`preset-card-${preset.id}`}
    >
      <EntityTileHead
        mark={<EntityMark icon={<Icon className="size-4.5" />} color={presetColorHex(preset)} />}
        title={preset.name}
        subtitle={metaLine(preset)}
        badges={<OriginBadge origin={preset.origin} />}
        description={preset.description}
      />
      <EntityTileFooter
        action={
          <span className="flex items-center gap-0.5 text-[13px] text-muted-foreground transition-colors group-hover/tile:text-foreground">
            Details
            <ChevronRightIcon className="size-3.5" />
          </span>
        }
      >
        <span className="font-mono text-[11px] text-muted-foreground">v{preset.version}</span>
        {preset.author ? <MetaChip>{preset.author}</MetaChip> : null}
        {preset.tags.slice(0, 2).map((tag) => (
          <MetaChip key={tag}>{tag}</MetaChip>
        ))}
      </EntityTileFooter>
    </EntityTile>
  );
}

function OriginBadge({ origin }: { origin: PresetOrigin }) {
  return (
    <MetaChip>
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: PRESET_ORIGIN_COLORS[origin] }}
      />
      {presetOriginLabel(origin)}
    </MetaChip>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function metaLine(preset: PresetDetail): string {
  if (preset.kind === 'agent') {
    const count = presetCapabilityNames(preset.body).length;
    return count > 0 ? `${preset.role} · ${count} capabilities` : preset.role;
  }
  const count = preset.roles.length;
  return `${count} ${count === 1 ? 'role' : 'roles'}`;
}
