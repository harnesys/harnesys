import {
  CONNECTOR_CATALOG,
  type ConnectorContent,
  type ConnectorDescriptor,
  type Integration,
} from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, CableIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { orgSourcesQuery } from '@/features/manage-connectors/model/drive-sources';
import { CapabilityChips } from '@/features/manage-connectors/ui/capability-chips';
import { ConnectorCard } from '@/features/manage-connectors/ui/connector-card';
import { ConnectorMark } from '@/features/manage-connectors/ui/connector-icon';
import { GithubDetail } from '@/features/manage-connectors/ui/github-detail';
import { GoogleDetail } from '@/features/manage-connectors/ui/google-detail';
import { integrationsQuery } from '@/shared/api/integrations';
import type { Source } from '@/shared/api/sources';
import { studioPath } from '@/shared/config/routes';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { StatusDot } from '@/shared/ui/status-dot';

const CONTENT_LABELS: Record<ConnectorContent, string> = {
  'drive-folders': 'Drive folders',
  'github-repos': 'Repositories',
  none: '—',
};

const AUTH_LABELS = {
  'oauth-browser': 'Browser OAuth',
  'github-app-install': 'GitHub App',
} as const;

export function ConnectorDetailPage() {
  const { orgId, connectorId } = useParams();
  const connector = CONNECTOR_CATALOG.find((item) => item.id === connectorId);
  if (!orgId || !connector) {
    return <Navigate to="/" replace />;
  }
  return <ConnectorDetail orgId={orgId} connector={connector} />;
}

function ConnectorDetail({ orgId, connector }: { orgId: string; connector: ConnectorDescriptor }) {
  const navigate = useNavigate();
  const integrations = useQuery(integrationsQuery(orgId));
  const sources = useQuery(orgSourcesQuery(orgId));
  const accounts = (integrations.data?.integrations ?? []).filter(
    (item) => item.provider === connector.id,
  );
  const connected = accounts.length > 0;

  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background"
      data-testid="connector-detail-page"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            void navigate(studioPath.settings(orgId, 'connectors'));
          }}
          data-testid="connector-detail-back"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to settings
        </Button>
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <CableIcon className="size-4" />
          Connectors
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
          <ConnectorCard
            className="flex flex-col gap-4 p-5"
            testId={`connector-detail-${connector.id}`}
          >
            <div className="flex items-start gap-4">
              <ConnectorMark connector={connector} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate font-heading font-medium text-xl">{connector.name}</h1>
                  {connector.status === 'planned' ? <Badge variant="outline">Planned</Badge> : null}
                </div>
                <p className="truncate text-[13px] text-muted-foreground">{connector.tagline}</p>
              </div>
              {connector.status === 'available' ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[13px]">
                  <StatusDot
                    tone={connected ? 'ok' : 'idle'}
                    label={connected ? 'Connected' : 'Not connected'}
                  />
                  {connected ? 'Connected' : 'Not connected'}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{connector.description}</p>
            <div className="flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
              <MetaItem label="Sign-in" value={AUTH_LABELS[connector.auth.kind]} />
              <MetaItem label="Content" value={CONTENT_LABELS[connector.content]} />
              {connector.capabilities.length > 0 ? (
                <MetaItem
                  label="Agent tools"
                  value={<CapabilityChips capabilities={connector.capabilities} />}
                />
              ) : null}
            </div>
          </ConnectorCard>

          {connector.status === 'available' ? (
            <ConnectorBody
              connector={connector}
              orgId={orgId}
              accounts={accounts}
              sources={sources.data?.sources}
              sourcesLoading={sources.isPending}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

interface ConnectorBodyProps {
  connector: ConnectorDescriptor;
  orgId: string;
  accounts: Integration[];
  sources: Source[] | undefined;
  sourcesLoading: boolean;
}

function ConnectorBody({
  connector,
  orgId,
  accounts,
  sources,
  sourcesLoading,
}: ConnectorBodyProps) {
  if (connector.id === 'google') {
    return (
      <GoogleDetail
        orgId={orgId}
        capabilities={connector.capabilities}
        accounts={accounts}
        sources={sources}
        sourcesLoading={sourcesLoading}
      />
    );
  }
  if (connector.id === 'github') {
    return (
      <GithubDetail
        orgId={orgId}
        capabilities={connector.capabilities}
        accounts={accounts}
        sources={sources}
        sourcesLoading={sourcesLoading}
      />
    );
  }
  return null;
}
