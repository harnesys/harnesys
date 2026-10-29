import type { McpConfigServer } from '@harnesys/contracts';
import type { ComponentStatus, GrantClass, ProjectMcpConfigServer } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import {
  confirmDeleteMcpServer,
  McpServerRow,
  openAddMcpServerDialog,
  openEditMcpServerDialog,
} from '@/features/manage-project-mcp';
import {
  deleteOrgMcpServer,
  listOrgMcp,
  orgMcpConfigQuery,
  orgMcpConfigQueryKey,
  reloadOrgMcp,
  restartOrgMcpServer,
  setOrgMcpServerState,
  upsertOrgMcpServer,
} from '@/shared/api/org-mcp';
import { approvePluginServer, pluginsQueryKeyFor } from '@/shared/api/plugins';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

function toProjectServer(server: McpConfigServer): ProjectMcpConfigServer {
  return {
    serverId: server.serverId,
    enabled: server.enabled,
    transport: server.transport,
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {}),
    connected: server.connected,
    toolCount: server.toolCount,
    origin:
      server.origin.kind === 'plugin'
        ? {
            kind: 'plugin',
            pluginName: server.origin.pluginName,
            status: (server.origin.status ?? 'native') as ComponentStatus,
            ...(server.origin.inertReason !== undefined
              ? { inertReason: server.origin.inertReason }
              : {}),
          }
        : { kind: 'project' },
    ...(server.disabledByUser !== undefined ? { disabledByUser: server.disabledByUser } : {}),
    ...(server.requiredGrant !== undefined
      ? { requiredGrant: server.requiredGrant as GrantClass }
      : {}),
  };
}

export function OrgMcpPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const configQuery = useQuery(orgMcpConfigQuery(orgId));
  const servers = configQuery.data?.servers ?? [];
  const liveQuery = useQuery({
    queryKey: ['orgs', orgId, 'mcp', 'live'],
    queryFn: () => listOrgMcp(orgId),
    enabled: Boolean(orgId),
  });
  const liveServers = new Map(
    (liveQuery.data?.servers ?? []).map((server) => [server.serverId, server]),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function invalidateMcp() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgMcpConfigQueryKey(orgId) }),
      queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'mcp', 'live'] }),
    ]);
  }

  const reload = useMutation({
    mutationFn: () => reloadOrgMcp(orgId),
    onSuccess: async (result) => {
      queryClient.setQueryData(orgMcpConfigQueryKey(orgId), result);
      await queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'mcp', 'live'] });
      toast.add({ title: 'MCP reloaded' });
    },
  });

  const upsert = useMutation({
    mutationFn: (input: { serverId: string; body: Parameters<typeof upsertOrgMcpServer>[2] }) =>
      upsertOrgMcpServer(orgId, input.serverId, input.body),
    onSuccess: async (result) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server saved', description: result.server.serverId });
    },
  });

  const remove = useMutation({
    mutationFn: (serverId: string) => deleteOrgMcpServer(orgId, serverId),
    onSuccess: async (_result, serverId) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server deleted', description: serverId });
    },
  });

  const approve = useMutation({
    mutationFn: (input: { pluginName: string; serverId: string }) =>
      approvePluginServer(orgId, input.pluginName, { serverId: input.serverId }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKeyFor(orgId) });
      await invalidateMcp();
      toast.add({ title: 'Server approved', description: input.serverId });
    },
    onError: (error) => {
      toast.add({
        title: 'Approve failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const setState = useMutation({
    mutationFn: (input: { serverId: string; enabled: boolean }) =>
      setOrgMcpServerState(orgId, input.serverId, { enabled: input.enabled }),
    onSuccess: async (result, input) => {
      queryClient.setQueryData(orgMcpConfigQueryKey(orgId), result);
      await queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'mcp', 'live'] });
      const actual = result.servers.find((server) => server.serverId === input.serverId);
      if (input.enabled && actual && !actual.enabled) {
        const blocked =
          actual.origin.kind === 'plugin' && actual.origin.status === 'blocked_by_grant';
        toast.add({
          title: 'Server still blocked',
          description: blocked
            ? 'Needs approval or grant — press Approve or check Plugins tab'
            : input.serverId,
        });
        return;
      }
      toast.add({
        title: input.enabled ? 'MCP server started' : 'MCP server stopped',
        description: input.serverId,
      });
    },
    onError: (error) => {
      toast.add({
        title: 'State change failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const restart = useMutation({
    mutationFn: (serverId: string) => restartOrgMcpServer(orgId, serverId),
    onSuccess: async (result, serverId) => {
      queryClient.setQueryData(orgMcpConfigQueryKey(orgId), result);
      await queryClient.invalidateQueries({ queryKey: ['orgs', orgId, 'mcp', 'live'] });
      toast.add({ title: 'MCP server restarted', description: serverId });
    },
  });

  const stateBusy = setState.isPending || restart.isPending || approve.isPending;
  const editBusy = upsert.isPending || remove.isPending;

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-mcp-pane">
      <RowHeader label="Servers" count={configQuery.isPending ? undefined : servers.length}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId || reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RefreshCwIcon />
          Reload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId || upsert.isPending}
          onClick={() => {
            void openAddMcpServerDialog().then((draft) => {
              if (!draft) {
                return;
              }
              upsert.mutate(draft);
            });
          }}
        >
          <PlusIcon />
          Add server
        </Button>
      </RowHeader>

      {configQuery.isPending && <RowListSkeleton testId="mcp-loading" />}
      {!configQuery.isPending &&
        (servers.length === 0 ? (
          <SettingsEmpty
            title="No MCP servers"
            description="Add a server to org mcp.json to connect tools."
          />
        ) : (
          <RowList>
            {servers.map((server) => {
              const projectServer = toProjectServer(server);
              const live = liveServers.get(server.serverId);
              return (
                <McpServerRow
                  key={server.serverId}
                  server={projectServer}
                  live={
                    live
                      ? {
                          serverId: live.serverId,
                          transport: live.transport,
                          connected: live.connected,
                          toolCount: live.toolCount,
                          tools: live.tools.map((tool) => ({
                            name: tool.name,
                            description: tool.description ?? '',
                          })),
                          resources: [],
                        }
                      : undefined
                  }
                  expanded={expandedId === server.serverId}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === server.serverId ? null : server.serverId,
                    )
                  }
                  stateBusy={stateBusy}
                  editBusy={editBusy}
                  onApprove={(pluginName, pointer) =>
                    approve.mutate({ pluginName, serverId: pointer })
                  }
                  onSetState={(serverId, enabled) => setState.mutate({ serverId, enabled })}
                  onRestart={(serverId) => restart.mutate(serverId)}
                  onEdit={(row) => {
                    void openEditMcpServerDialog(row).then((draft) => {
                      if (!draft) {
                        return;
                      }
                      upsert.mutate(draft);
                    });
                  }}
                  onDelete={(serverId) => {
                    void confirmDeleteMcpServer(serverId).then((confirmed) => {
                      if (confirmed) {
                        remove.mutate(serverId);
                      }
                    });
                  }}
                />
              );
            })}
          </RowList>
        ))}
    </div>
  );
}
