import { CONNECTOR_CATALOG, type ConnectorDescriptor } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Link } from 'react-router';
import { integrationsQuery } from '@/shared/api/integrations';
import { studioPath } from '@/shared/config/routes';
import { Badge } from '@/shared/ui/badge';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { CONNECTOR_CARD_CLASSES } from './ui/connector-card';
import { ConnectorMark } from './ui/connector-icon';

export function ConnectorsPane({ orgId }: { orgId: string }) {
  const integrations = useQuery(integrationsQuery(orgId));
  const accounts = integrations.data?.integrations ?? [];
  const available = CONNECTOR_CATALOG.filter((item) => item.status === 'available');
  const planned = CONNECTOR_CATALOG.filter((item) => item.status === 'planned');
  return (
    <div className="flex w-full flex-col gap-8" data-testid="connectors-pane">
      <SettingsSection
        label="Available"
        description="Connect a provider once, then attach its content as sources and give agents its tools."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((connector) => (
            <ConnectorTile
              key={connector.id}
              connector={connector}
              orgId={orgId}
              connected={accounts.some((account) => account.provider === connector.id)}
            />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection label="Planned" description="Not available yet.">
        <div className="grid gap-3 sm:grid-cols-2">
          {planned.map((connector) => (
            <ConnectorTile key={connector.id} connector={connector} orgId={orgId} />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

const TILE_CLASSES = `${CONNECTOR_CARD_CLASSES} flex items-center gap-3 p-4`;

interface ConnectorTileProps {
  connector: ConnectorDescriptor;
  orgId: string;
  connected?: boolean;
}

function tileBadge(connector: ConnectorDescriptor, connected: boolean | undefined) {
  if (connector.status === 'planned') {
    return <Badge variant="outline">Planned</Badge>;
  }
  if (connected) {
    return (
      <Badge variant="secondary" data-testid={`connectors-status-${connector.id}`}>
        Connected
      </Badge>
    );
  }
  return null;
}

function ConnectorTile({ connector, orgId, connected }: ConnectorTileProps) {
  const planned = connector.status === 'planned';
  const badge = tileBadge(connector, connected);
  const body = (
    <>
      <ConnectorMark connector={connector} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{connector.name}</span>
          {badge}
        </div>
        <span className="truncate text-[13px] text-muted-foreground">{connector.tagline}</span>
      </div>
      {planned ? null : (
        <span className="shrink-0 text-muted-foreground" aria-hidden="true">
          <PlusIcon className="size-4" />
        </span>
      )}
    </>
  );
  if (planned) {
    return (
      <div className={`${TILE_CLASSES} opacity-60`} data-testid={`connectors-tile-${connector.id}`}>
        {body}
      </div>
    );
  }
  return (
    <Link
      to={studioPath.connector(orgId, connector.id)}
      className={`${TILE_CLASSES} transition-colors hover:bg-sidebar-accent/40`}
      data-testid={`connectors-tile-${connector.id}`}
    >
      {body}
    </Link>
  );
}
