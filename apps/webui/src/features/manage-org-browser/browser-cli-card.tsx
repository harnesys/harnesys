import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, DownloadIcon, RefreshCwIcon, TerminalIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowChip, RowField, RowSection } from '@/shared/ui/capability-rows';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { toast } from '@/shared/ui/toast';
import {
  type AgentBrowserUpdateCheck,
  type OrgBrowserHostView,
  orgBrowserQueryKey,
  postOrgBrowserAgentBrowserInstall,
  postOrgBrowserAgentBrowserUpdateCheck,
} from './org-browser-api';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

interface BrowserCliCardProps {
  orgId: string;
  host: OrgBrowserHostView;
}

export function BrowserCliCard({ orgId, host }: BrowserCliCardProps) {
  const queryClient = useQueryClient();
  const installed = host.agentBrowserPath !== null;
  const [updateCheck, setUpdateCheck] = useState<AgentBrowserUpdateCheck | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: orgBrowserQueryKey(orgId) });
  }

  const install = useMutation({
    mutationFn: (version: string | undefined) =>
      postOrgBrowserAgentBrowserInstall(orgId, host.hostId, version),
    onSuccess: (result) => {
      setUpdateCheck(null);
      refresh();
      toast.add({
        title: `agent-browser ${result.version} installed`,
        description: `${result.commands.length} commands available`,
      });
    },
    onError: (error) => {
      toast.add({ title: 'Failed to install browser CLI', description: errorMessage(error) });
    },
  });

  const checkUpdate = useMutation({
    mutationFn: () => postOrgBrowserAgentBrowserUpdateCheck(orgId, host.hostId),
    onSuccess: (result) => setUpdateCheck(result),
    onError: (error) => {
      toast.add({ title: 'Update check failed', description: errorMessage(error) });
    },
  });

  return (
    <Card data-testid={`browser-cli-card-${host.hostId}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TerminalIcon className="size-4 text-muted-foreground" />
          Browser CLI
          {installed ? (
            <Badge variant="secondary" data-testid={`browser-cli-version-${host.hostId}`}>
              v{host.agentBrowserVersion ?? '?'}
            </Badge>
          ) : (
            <Badge variant="outline" data-testid={`browser-cli-missing-${host.hostId}`}>
              not installed
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          agent-browser provides the `browser` tool surface for agents — the full CLI runs in the
          thread session. The command reference ships with the CLI and always matches the installed
          version.
        </CardDescription>
        <CardAction>
          {installed ? (
            <div className="flex items-center gap-2">
              {updateCheck?.updateAvailable === false && (
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <CheckIcon className="size-3.5" />
                  up to date
                </span>
              )}
              {updateCheck?.updateAvailable === true && (
                <Button
                  type="button"
                  size="sm"
                  disabled={install.isPending}
                  onClick={() => install.mutate(updateCheck.latest)}
                  data-testid={`browser-cli-update-${host.hostId}`}
                >
                  <RefreshCwIcon />
                  {install.isPending ? 'Updating…' : `Update to v${updateCheck.latest}`}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={checkUpdate.isPending}
                onClick={() => checkUpdate.mutate()}
                data-testid={`browser-cli-check-${host.hostId}`}
              >
                {checkUpdate.isPending ? 'Checking…' : 'Check update'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={install.isPending}
              onClick={() => install.mutate(undefined)}
              data-testid={`browser-cli-install-${host.hostId}`}
            >
              <DownloadIcon />
              {install.isPending ? 'Installing…' : 'Install'}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <RowSection label="Details">
          {installed ? (
            <>
              <RowField label="Version" value={`v${host.agentBrowserVersion ?? 'unknown'}`} />
              <RowField label="Binary" value={host.agentBrowserPath ?? ''} />
              <div className="px-1 py-0.5">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  Commands in this CLI version ({host.agentBrowserCommands.length}):
                </p>
                <div
                  className="flex flex-wrap gap-1"
                  data-testid={`browser-cli-commands-${host.hostId}`}
                >
                  {host.agentBrowserCommands.map((command) => (
                    <RowChip key={command}>{command}</RowChip>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <RowField
              label="Status"
              value="Not installed — the browser tool is unavailable to agents on this host."
            />
          )}
        </RowSection>
      </CardContent>
    </Card>
  );
}
