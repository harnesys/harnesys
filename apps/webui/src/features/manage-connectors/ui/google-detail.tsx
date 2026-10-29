import type { ConnectorCapability, Integration } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { googleAppStatusQuery, googleAppStatusQueryKey } from '@/shared/api/integrations';
import type { Source } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { ConnectorCard } from './connector-card';
import { GoogleAccountsSection } from './google-accounts';
import { GoogleAppCredentialsDialog } from './google-app-credentials-dialog';

interface GoogleDetailProps {
  orgId: string;
  capabilities: ConnectorCapability[];
  accounts: Integration[];
  sources: Source[] | undefined;
  sourcesLoading: boolean;
}

export function GoogleDetail({
  orgId,
  capabilities,
  accounts,
  sources,
  sourcesLoading,
}: GoogleDetailProps) {
  const [connecting, setConnecting] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <GoogleAppSection orgId={orgId} />
      <GoogleAccountsSection
        orgId={orgId}
        capabilities={capabilities}
        accounts={accounts}
        sources={sources}
        sourcesLoading={sourcesLoading}
        connecting={connecting}
        onConnect={() => setConnecting(true)}
        onFinishConnect={() => setConnecting(false)}
      />
    </div>
  );
}

function GoogleAppSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const status = useQuery(googleAppStatusQuery(orgId));
  const [editing, setEditing] = useState(false);
  const configured = status.data?.configured === true;

  const refreshStatus = () => {
    void queryClient.invalidateQueries({ queryKey: googleAppStatusQueryKey(orgId) });
  };

  return (
    <SettingsSection
      label="Google Cloud App"
      description="One OAuth client authorizes every connected account. Credentials are stored encrypted in this organization only — Harnesys never sees them."
      testId="connectors-google-app-section"
    >
      <ConnectorCard className="flex items-center gap-3 p-4">
        <StatusDot
          tone={configured ? 'ok' : 'idle'}
          label={configured ? 'Configured' : 'Not configured'}
        />
        <p className="min-w-0 flex-1 text-[13px]">
          {appStatusText(status.isPending, configured, status.data?.clientId)}
        </p>
        <Button
          type="button"
          variant={configured ? 'outline' : 'default'}
          size="sm"
          onClick={() => setEditing(true)}
          data-testid="connectors-google-app-edit"
        >
          {configured ? 'Edit credentials' : 'Set up Google Cloud App'}
        </Button>
      </ConnectorCard>
      {editing && status.data ? (
        <GoogleAppCredentialsDialog
          orgId={orgId}
          status={status.data}
          open={editing}
          onOpenChange={setEditing}
          onSaved={refreshStatus}
        />
      ) : null}
    </SettingsSection>
  );
}

function appStatusText(
  isPending: boolean,
  configured: boolean,
  clientId: string | undefined,
): string {
  if (isPending) {
    return 'Checking…';
  }
  if (configured && clientId) {
    return `Configured — client ${clientId}`;
  }
  if (configured) {
    return 'Configured';
  }
  return 'Not configured — set up the OAuth client before connecting accounts.';
}
