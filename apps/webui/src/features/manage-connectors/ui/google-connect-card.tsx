import type { GoogleOAuthService } from '@harnesys/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { StatusDot } from '@/shared/ui/status-dot';
import { googleServiceLabels } from '../model/google-services';
import { ConnectorCard } from './connector-card';
import { GoogleServicePicker, GoogleServiceSummaryLine } from './google-service-picker';

interface GoogleConnectCardProps {
  onContinue: (services: GoogleOAuthService[]) => void;
  onCancel: () => void;
}

export function GoogleConnectCard({ onContinue, onCancel }: GoogleConnectCardProps) {
  const [services, setServices] = useState<GoogleOAuthService[]>([
    'drive',
    'gmail',
    'calendar',
    'sheets',
    'docs',
    'search_console',
  ]);

  return (
    <ConnectorCard className="flex flex-col gap-3 p-4" testId="connectors-google-pick-services">
      <div className="flex items-center gap-2">
        <StatusDot tone="wait" label="New account" />
        <p className="min-w-0 flex-1 font-medium text-sm">
          What will this Google account do in Harnesys?
        </p>
      </div>
      <p className="text-muted-foreground text-xs leading-4">
        Pick the services for this account — Google only asks for those permissions. Other accounts
        can use a different set. Missing something later? Reconnect and tick it.
      </p>
      <GoogleServicePicker selected={services} onChange={setServices} />
      <GoogleServiceSummaryLine services={services} />
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={services.length === 0}
          onClick={() => onContinue(services)}
          data-testid="connectors-google-pick-continue"
        >
          Continue with {googleServiceLabels(services)}
        </Button>
      </div>
    </ConnectorCard>
  );
}
