import { ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { buttonVariants } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { EntityTile, EntityTileFooter, EntityTileHead } from '@/shared/ui/entity-tile';
import { StatusDot } from '@/shared/ui/status-dot';
import { Switch } from '@/shared/ui/switch';
import { AddonMark } from './addon-mark';
import type { AddonCardModel } from './lib/addon-cards';
import { ADDON_TRUST_LABEL, addonHealthLabel, addonHealthTone } from './lib/addon-labels';

interface AddonTileProps {
  card: AddonCardModel;
  pending: boolean;
  path: string;
  onEnable: () => void;
  onDisable: () => void;
}

export function AddonTile({ card, pending, path, onEnable, onDisable }: AddonTileProps) {
  const latest = card.versions[0];
  const org = card.org;
  const enabled = org?.enabled === true;
  return (
    <EntityTile className="gap-3 p-4" testId={`manage-addon-${card.id}`}>
      <EntityTileHead
        mark={<AddonMark size="sm" icon={card.org?.icon} color={card.org?.color} />}
        title={
          <Link
            to={path}
            data-testid={`addon-open-${card.id}`}
            className="truncate font-medium text-sm hover:underline"
          >
            {card.title}
          </Link>
        }
        badges={
          <>
            {enabled ? (
              <Badge variant="secondary" data-testid={`addon-state-${card.id}`}>
                Enabled
              </Badge>
            ) : null}
            {latest?.trust === 'builtin' ? <Badge variant="outline">System</Badge> : null}
          </>
        }
        description={card.description || card.id}
        action={
          org ? (
            <Switch
              size="sm"
              checked={enabled}
              disabled={pending}
              onCheckedChange={(value) => (value === true ? onEnable() : onDisable())}
              data-testid={`addon-switch-${card.id}`}
              aria-label={enabled ? `Disable ${card.title}` : `Enable ${card.title}`}
            />
          ) : undefined
        }
      />
      <EntityTileFooter
        action={
          <Link
            to={path}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'shrink-0 text-muted-foreground',
            )}
            data-testid={`addon-details-${card.id}`}
          >
            Details
            <ChevronRightIcon data-icon="inline-end" />
          </Link>
        }
      >
        {org ? (
          <StatusDot tone={addonHealthTone(org.health)} label={addonHealthLabel(org.health)} />
        ) : null}
        <span className="font-mono text-[11px] text-muted-foreground">
          {org?.version ?? latest?.version ?? card.id}
        </span>
        {card.versions.length > 1 ? <RowChip>{`${card.versions.length} versions`}</RowChip> : null}
        {latest && latest.trust !== 'builtin' ? (
          <RowChip>{ADDON_TRUST_LABEL[latest.trust]}</RowChip>
        ) : null}
        {org && org.compatibility.outcome === 'incompatible' ? (
          <RowChip tone="danger">incompatible</RowChip>
        ) : null}
        {org?.updateAvailable ? <RowChip tone="warn">update {org.updateAvailable}</RowChip> : null}
      </EntityTileFooter>
    </EntityTile>
  );
}
