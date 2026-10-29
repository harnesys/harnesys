import type { BrowserDefaultEngine } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/toast';
import { BrowserCliCard } from './browser-cli-card';
import { EngineInstallDialog } from './engine-install-dialog';
import { HostEngineRow } from './engine-row';
import {
  deleteOrgBrowserEngine,
  type EngineSpec,
  type OrgBrowserHostView,
  orgBrowserQuery,
  orgBrowserQueryKey,
  postOrgBrowserAllowlist,
  putOrgBrowserEngineState,
  putOrgBrowserSettings,
} from './org-browser-api';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function engineSpecOf(engines: readonly EngineSpec[], engineId: string): EngineSpec | undefined {
  return engines.find((engine) => engine.id === engineId);
}

export function OrgBrowserPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const browserQuery = useQuery(orgBrowserQuery(orgId));
  const engines = browserQuery.data?.engines ?? [];
  const hosts = browserQuery.data?.hosts ?? [];
  const defaultEngine = browserQuery.data?.defaultEngine ?? 'auto';
  const [hostTab, setHostTab] = useState('local');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [installSpec, setInstallSpec] = useState<{ hostId: string; spec: EngineSpec } | null>(null);

  const activeHostId = hosts.some((host) => host.hostId === hostTab)
    ? hostTab
    : (hosts[0]?.hostId ?? 'local');
  const activeHost: OrgBrowserHostView | undefined = hosts.find(
    (host) => host.hostId === activeHostId,
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: orgBrowserQueryKey(orgId) });
  }

  const settings = useMutation({
    mutationFn: (next: BrowserDefaultEngine) => putOrgBrowserSettings(orgId, next),
    onSuccess: () => {
      refresh();
      toast.add({ title: 'Default engine updated' });
    },
    onError: (error) => {
      toast.add({ title: 'Failed to update default engine', description: errorMessage(error) });
    },
  });

  const allowlist = useMutation({
    mutationFn: (input: { hostId: string; engineId: string }) =>
      postOrgBrowserAllowlist(orgId, input.hostId, input.engineId),
    onSuccess: () => refresh(),
    onError: (error) => {
      toast.add({ title: 'Failed to add engine', description: errorMessage(error) });
    },
  });

  const engineState = useMutation({
    mutationFn: (input: { engineId: string; hostId: string; enabled: boolean }) =>
      putOrgBrowserEngineState(orgId, input.engineId, input.hostId, input.enabled),
    onSuccess: () => refresh(),
    onError: (error) => {
      toast.add({ title: 'Failed to update engine state', description: errorMessage(error) });
    },
  });

  const remove = useMutation({
    mutationFn: (input: { engineId: string; hostId: string }) =>
      deleteOrgBrowserEngine(orgId, input.engineId, input.hostId),
    onSuccess: () => refresh(),
    onError: (error) => {
      toast.add({ title: 'Failed to remove engine', description: errorMessage(error) });
    },
  });

  const addableEngines = engines.filter(
    (candidate) =>
      candidate.install !== undefined &&
      !activeHost?.entries.some((entry) => entry.engineId === candidate.id),
  );

  return (
    <div className="flex w-full flex-col gap-6" data-testid="org-browser-pane">
      {activeHost && <BrowserCliCard orgId={orgId} host={activeHost} />}

      <RowHeader
        label="Browser engines"
        description="Per-host engine lists for the browser pack. An engine grants access only when it is on the host list, installed, and enabled."
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                data-testid={`browser-add-${activeHostId}`}
              />
            }
          >
            <PlusIcon />
            Add engine
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {addableEngines.map((candidate) => (
              <DropdownMenuItem
                key={candidate.id}
                onClick={() => allowlist.mutate({ hostId: activeHostId, engineId: candidate.id })}
              >
                {candidate.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </RowHeader>

      {browserQuery.isError && (
        <SettingsErrorBanner
          message={errorMessage(browserQuery.error)}
          onRetry={() => void browserQuery.refetch()}
          testId="org-browser-error"
        />
      )}

      <Tabs value={activeHostId} onValueChange={setHostTab}>
        <TabsList className="h-8 w-full">
          {hosts.map((host) => (
            <TabsTrigger
              key={host.hostId}
              value={host.hostId}
              className="flex-1"
              data-testid={`browser-tab-${host.hostId}`}
            >
              {host.hostId}
            </TabsTrigger>
          ))}
        </TabsList>
        {hosts.map((host) => (
          <TabsContent key={host.hostId} value={host.hostId} className="mt-3">
            <div className="flex flex-col gap-2" data-testid={`browser-host-${host.hostId}`}>
              {browserQuery.isPending && (
                <RowListSkeleton testId={`org-browser-loading-${host.hostId}`} />
              )}
              {!browserQuery.isPending && host.entries.length === 0 && (
                <p className="py-2 text-muted-foreground text-xs">
                  No engines on this host — agents here have no browser access.
                </p>
              )}
              <RowList>
                {host.entries.map((entry) => {
                  const spec = engineSpecOf(engines, entry.engineId);
                  if (!spec) {
                    return null;
                  }
                  const key = `${host.hostId}:${entry.engineId}`;
                  const isDefault = defaultEngine === entry.engineId;
                  return (
                    <HostEngineRow
                      key={key}
                      entry={entry}
                      spec={spec}
                      hostId={host.hostId}
                      isDefault={isDefault}
                      expanded={expandedKey === key}
                      onExpand={() => setExpandedKey((current) => (current === key ? null : key))}
                      onDefault={() => {
                        if (isDefault) {
                          settings.mutate('auto');
                          return;
                        }
                        settings.mutate(entry.engineId);
                      }}
                      onInstall={() => setInstallSpec({ hostId: host.hostId, spec })}
                      onToggleEnabled={() =>
                        engineState.mutate({
                          engineId: entry.engineId,
                          hostId: host.hostId,
                          enabled: !entry.enabled,
                        })
                      }
                      onRemove={() =>
                        remove.mutate({ engineId: entry.engineId, hostId: host.hostId })
                      }
                    />
                  );
                })}
              </RowList>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {installSpec && (
        <EngineInstallDialog
          orgId={orgId}
          hostId={installSpec.hostId}
          spec={installSpec.spec}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInstallSpec(null);
            }
          }}
          onInstalled={refresh}
        />
      )}
    </div>
  );
}
