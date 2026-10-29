import type { FleetNode } from '@harnesys/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Row, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsField } from '@/shared/ui/settings-kit';

function PromoteCollapsible({
  action,
  testId,
  children,
}: {
  action: string;
  testId: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <RowList>
      <Row
        testId={testId}
        title="Advanced"
        mono={false}
        summary={action}
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
      >
        <div className="flex flex-col gap-1 pt-1">{children}</div>
      </Row>
    </RowList>
  );
}

interface FleetPromoteStartProps {
  nodes: FleetNode[];
  promoteNodeId: string;
  onPromoteNodeIdChange: (value: string) => void;
  promoteUrl: string;
  onPromoteUrlChange: (value: string) => void;
  promoteToken: string | null;
  busy: boolean;
  onStart: () => void;
}

export function FleetPromoteStartSection({
  nodes,
  promoteNodeId,
  onPromoteNodeIdChange,
  promoteUrl,
  onPromoteUrlChange,
  promoteToken,
  busy,
  onStart,
}: FleetPromoteStartProps) {
  const workers = nodes.filter((node) => node.role === 'worker');
  return (
    <PromoteCollapsible action="Promote relay" testId="fleet-promote">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Move the server role to another machine. The target becomes relay; this machine stays a
        worker after the target accepts.
      </p>
      <SettingsField
        label="Target worker"
        htmlFor="promote-node"
        description="The worker that will become the new server."
      >
        <Select
          value={promoteNodeId}
          onValueChange={(value) => {
            if (value) {
              onPromoteNodeIdChange(value);
            }
          }}
        >
          <SelectTrigger id="promote-node" className="w-full" data-testid="promote-node-select">
            <SelectValue placeholder="Select worker..." />
          </SelectTrigger>
          <SelectContent>
            {workers.map((node) => (
              <SelectItem key={node.id} value={node.id}>
                {node.name} ({node.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField label="New relay URL" htmlFor="promote-url">
        <Input
          id="promote-url"
          value={promoteUrl}
          onChange={(event) => onPromoteUrlChange(event.target.value)}
          placeholder="https://relay.example"
          data-testid="promote-url"
        />
      </SettingsField>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={busy || workers.length === 0}
        onClick={() => void onStart()}
        data-testid="promote-start"
      >
        Start promote
      </Button>
      {promoteToken ? (
        <p
          className="wrap-anywhere rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs"
          data-testid="promote-token"
        >
          Token: {promoteToken}
        </p>
      ) : null}
    </PromoteCollapsible>
  );
}

interface FleetPromoteAcceptProps {
  acceptFrom: string;
  onAcceptFromChange: (value: string) => void;
  acceptToken: string;
  onAcceptTokenChange: (value: string) => void;
  busy: boolean;
  onAccept: () => void;
}

export function FleetPromoteAcceptSection({
  acceptFrom,
  onAcceptFromChange,
  acceptToken,
  onAcceptTokenChange,
  busy,
  onAccept,
}: FleetPromoteAcceptProps) {
  return (
    <PromoteCollapsible action="Accept promote" testId="fleet-promote-accept">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Become the relay for this organization. Paste the token issued on the current server.
      </p>
      <SettingsField label="Source relay URL" htmlFor="accept-from">
        <Input
          id="accept-from"
          value={acceptFrom}
          onChange={(event) => onAcceptFromChange(event.target.value)}
          data-testid="promote-accept-from"
        />
      </SettingsField>
      <SettingsField label="Promote token" htmlFor="accept-token">
        <Input
          id="accept-token"
          value={acceptToken}
          onChange={(event) => onAcceptTokenChange(event.target.value)}
          data-testid="promote-accept-token"
        />
      </SettingsField>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={busy}
        onClick={() => void onAccept()}
        data-testid="promote-accept"
      >
        Accept promote
      </Button>
    </PromoteCollapsible>
  );
}
