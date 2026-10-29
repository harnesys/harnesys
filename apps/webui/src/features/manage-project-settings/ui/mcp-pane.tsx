import type { UpsertProjectMcpServerRequest } from '@harnesys/studio-shared';
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
  approvePluginServer,
  deleteProjectMcpServer,
  pluginsQueryKeyFor,
  projectMcpConfigQuery,
  projectMcpConfigQueryKey,
  projectMcpQuery,
  projectMcpQueryKey,
  reloadProjectMcp,
  restartProjectMcpServer,
  setProjectMcpServerState,
  upsertProjectMcpServer,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
export function McpPane({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    ...projectMcpConfigQuery(projectId),
    enabled: Boolean(projectId),
  });
  const servers = configQuery.data?.servers ?? [];
  const liveQuery = useQuery({
    ...projectMcpQuery(projectId),
    enabled: Boolean(projectId),
  });
  const liveServers = new Map(
    (liveQuery.data?.servers ?? []).map((server) => [server.serverId, server]),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  async function invalidateMcp() {
    if (!projectId) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectMcpConfigQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectMcpQueryKey(projectId) }),
    ]);
  }
  const reload = useMutation({
    mutationFn: () => {
      if (!projectId) {
        throw new Error('No project');
      }
      return reloadProjectMcp(projectId);
    },
    onSuccess: async (result) => {
      if (!projectId) {
        return;
      }
      queryClient.setQueryData(projectMcpConfigQueryKey(projectId), result);
      await queryClient.invalidateQueries({ queryKey: projectMcpQueryKey(projectId) });
      toast.add({ title: 'MCP reloaded' });
    },
  });
  const upsert = useMutation({
    mutationFn: (input: { serverId: string; body: UpsertProjectMcpServerRequest }) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return upsertProjectMcpServer(projectId, input.serverId, input.body);
    },
    onSuccess: async (result) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server saved', description: result.server.serverId });
    },
  });
  const remove = useMutation({
    mutationFn: (serverId: string) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return deleteProjectMcpServer(projectId, serverId);
    },
    onSuccess: async (_result, serverId) => {
      await invalidateMcp();
      toast.add({ title: 'MCP server deleted', description: serverId });
    },
  });
  const approve = useMutation({
    mutationFn: (input: { pluginName: string; serverId: string }) =>
      approvePluginServer(projectId, input.pluginName, { serverId: input.serverId }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKeyFor(projectId) });
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
    mutationFn: (input: { serverId: string; enabled: boolean }) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return setProjectMcpServerState(projectId, input.serverId, {
        enabled: input.enabled,
      });
    },
    onSuccess: async (result, input) => {
      if (projectId) {
        queryClient.setQueryData(projectMcpConfigQueryKey(projectId), result);
        await queryClient.invalidateQueries({ queryKey: projectMcpQueryKey(projectId) });
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
    mutationFn: (serverId: string) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return restartProjectMcpServer(projectId, serverId);
    },
    onSuccess: async (result, serverId) => {
      if (projectId) {
        queryClient.setQueryData(projectMcpConfigQueryKey(projectId), result);
        await queryClient.invalidateQueries({ queryKey: projectMcpQueryKey(projectId) });
      }
      toast.add({ title: 'MCP server restarted', description: serverId });
    },
    onError: (error) => {
      toast.add({
        title: 'Restart failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
  const stateBusy = setState.isPending || restart.isPending || approve.isPending;
  const editBusy = upsert.isPending || remove.isPending;
  return (
    <div className="flex w-full flex-col gap-6" data-testid="mcp-pane">
      <RowHeader label="Servers" count={configQuery.isPending ? undefined : servers.length}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!projectId || reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RefreshCwIcon />
          Reload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!projectId || upsert.isPending}
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
            description="No servers in `.harnesys/mcp.json`. Add a server to connect tools."
          />
        ) : (
          <RowList>
            {servers.map((server) => (
              <McpServerRow
                key={server.serverId}
                server={server}
                live={liveServers.get(server.serverId)}
                expanded={expandedId === server.serverId}
                onToggle={() =>
                  setExpandedId((current) => (current === server.serverId ? null : server.serverId))
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
            ))}
          </RowList>
        ))}
    </div>
  );
}
