import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  deleteOrgLspServer,
  enableOrgLspServer,
  installOrgLspBinary,
  orgLspQuery,
  orgLspQueryKey,
  putOrgLsp,
  restartOrgLspServer,
  stopOrgLspServer,
} from '@/shared/api/org-lsp';
import { approvePluginServer, pluginsQueryKeyFor } from '@/shared/api/plugins';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { RowListSkeleton, SettingsEmpty, SettingsSave } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { OrgLspCatalog } from './org-lsp-catalog';
import { type LspServerAction, OrgLspServerRow } from './org-lsp-server-row';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function invokeServerAction(orgId: string, serverId: string, action: LspServerAction) {
  if (action === 'restart') {
    return restartOrgLspServer(orgId, serverId);
  }
  if (action === 'stop') {
    return stopOrgLspServer(orgId, serverId);
  }
  return enableOrgLspServer(orgId, serverId);
}

export function OrgLspPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const lspQuery = useQuery(orgLspQuery(orgId));
  const servers = lspQuery.data?.servers ?? [];
  const catalog = lspQuery.data?.catalog ?? [];
  const diagnostics = lspQuery.data?.diagnostics ?? [];
  const liveCount = servers.filter(
    (server) => !server.disabled && server.binaryOk && server.status === 'live',
  ).length;
  const fileServers = servers.filter((server) => server.origin === 'file');
  const pluginServers = servers.filter((server) => server.origin !== 'file');
  const installCommands = new Map(
    catalog.map((entry): [string, string] => [entry.command, entry.install]),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [raw, setRaw] = useState('{}');
  const [busy, setBusy] = useState<'action' | 'install' | 'remove' | 'approve' | null>(null);

  useEffect(() => {
    if (lspQuery.data) {
      setRaw(JSON.stringify(lspQuery.data.raw ?? {}, null, 2));
    }
  }, [lspQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const parsed: unknown = JSON.parse(raw);
      return putOrgLsp(orgId, parsed);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(orgLspQueryKey(orgId), result);
      setRaw(JSON.stringify(result.raw ?? {}, null, 2));
      toast.add({ title: 'LSP config saved' });
    },
    onError: (error) => {
      toast.add({ title: 'Save failed', description: errorMessage(error) });
    },
  });

  async function runServerAction(serverId: string, action: LspServerAction) {
    setBusy('action');
    try {
      const result = await invokeServerAction(orgId, serverId, action);
      queryClient.setQueryData(orgLspQueryKey(orgId), result);
      const titles: Record<LspServerAction, string> = {
        restart: 'LSP server restarted',
        stop: 'LSP server stopped',
        enable: 'LSP server enabled',
      };
      toast.add({ title: titles[action], description: serverId });
    } catch (error) {
      toast.add({ title: 'Action failed', description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function runInstall(serverId: string) {
    setBusy('install');
    try {
      const result = await installOrgLspBinary(orgId, serverId);
      queryClient.setQueryData(orgLspQueryKey(orgId), result);
      toast.add({ title: 'Binary installed', description: serverId });
    } catch (error) {
      toast.add({ title: 'Install failed', description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function runRemove(serverId: string) {
    setBusy('remove');
    try {
      await deleteOrgLspServer(orgId, serverId);
      await queryClient.invalidateQueries({ queryKey: orgLspQueryKey(orgId) });
      toast.add({ title: 'Server deleted', description: serverId });
    } catch (error) {
      toast.add({ title: 'Delete failed', description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const approve = useMutation({
    mutationFn: (input: { pluginName: string; serverId: string }) =>
      approvePluginServer(orgId, input.pluginName, { serverId: input.serverId }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKeyFor(orgId) });
      await runServerAction(input.serverId, 'restart');
      toast.add({ title: 'Server approved', description: input.serverId });
    },
    onError: (error) => {
      toast.add({ title: 'Approve failed', description: errorMessage(error) });
    },
  });

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-lsp-pane">
      <RowHeader
        label="Language servers"
        count={lspQuery.isPending ? undefined : servers.length}
        description={
          liveCount > 0
            ? `${liveCount} of ${servers.length} live. Editor diagnostics and agent lsp_* tools run through them.`
            : 'Editor diagnostics and agent lsp_* tools run through them.'
        }
      />

      {diagnostics.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
          data-testid="lsp-diagnostics"
        >
          {diagnostics.map((diagnostic) => (
            <p
              key={`${diagnostic.code}:${diagnostic.message}`}
              className="text-destructive text-xs"
            >
              {diagnostic.path ? `${diagnostic.path}: ` : ''}
              {diagnostic.message}
            </p>
          ))}
        </div>
      )}

      {lspQuery.isPending && <RowListSkeleton rows={4} testId="lsp-loading" />}

      {!lspQuery.isPending && servers.length === 0 && (
        <SettingsEmpty
          title="No language servers"
          description="Add one from the catalog below, or edit the raw config."
        />
      )}

      {!lspQuery.isPending && fileServers.length > 0 && (
        <section className="flex flex-col gap-1">
          <RowHeader
            label="Configured"
            count={fileServers.length}
            description="Stored in .harnesys/lsp.json — the primary source of truth."
          />
          <RowList testId="lsp-file-servers">
            {fileServers.map((server) => (
              <OrgLspServerRow
                key={server.serverId}
                server={server}
                installCommand={installCommands.get(server.command)}
                expanded={expandedId === server.serverId}
                onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
                busy={busy}
                onAction={(serverId, action) => void runServerAction(serverId, action)}
                onApprove={(input) => approve.mutate(input)}
                onInstall={(serverId) => void runInstall(serverId)}
                onRemove={(serverId) => void runRemove(serverId)}
              />
            ))}
          </RowList>
        </section>
      )}

      {!lspQuery.isPending && pluginServers.length > 0 && (
        <section className="flex flex-col gap-1">
          <RowHeader
            label="Plugins"
            count={pluginServers.length}
            description="Provided by installed plugins, in one place with configured servers."
          />
          <RowList testId="lsp-plugin-servers">
            {pluginServers.map((server) => (
              <OrgLspServerRow
                key={server.serverId}
                server={server}
                installCommand={installCommands.get(server.command)}
                expanded={expandedId === server.serverId}
                onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
                busy={busy}
                onAction={(serverId, action) => void runServerAction(serverId, action)}
                onApprove={(input) => approve.mutate(input)}
                onInstall={(serverId) => void runInstall(serverId)}
                onRemove={(serverId) => void runRemove(serverId)}
              />
            ))}
          </RowList>
        </section>
      )}

      {!lspQuery.isPending && catalog.length > 0 && (
        <OrgLspCatalog orgId={orgId} catalog={catalog.filter((entry) => !entry.installed)} />
      )}

      <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
          Raw config
          <span className="text-[11px] text-muted-foreground">.harnesys/lsp.json</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 pt-1">
            <Textarea
              aria-label="Raw LSP config JSON"
              className="min-h-40 font-mono text-xs"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
            <SettingsSave
              dirty={
                raw !== (lspQuery.data ? JSON.stringify(lspQuery.data.raw ?? {}, null, 2) : '')
              }
              pending={save.isPending}
              onSave={() => save.mutate()}
              onDiscard={() => {
                if (lspQuery.data) {
                  setRaw(JSON.stringify(lspQuery.data.raw ?? {}, null, 2));
                }
              }}
              testId="lsp-raw-save"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
