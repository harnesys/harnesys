import type { OrgLspEntry } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, FileCode2Icon, PauseIcon, PlayIcon, RotateCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  enableOrgLspServer,
  orgLspQuery,
  orgLspQueryKey,
  putOrgLsp,
  restartOrgLspServer,
  stopOrgLspServer,
} from '@/shared/api/org-lsp';
import { Button } from '@/shared/ui/button';
import {
  Row,
  RowChip,
  RowField,
  RowHeader,
  RowList,
  RowSection,
} from '@/shared/ui/capability-rows';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { RowListSkeleton, SettingsEmpty, SettingsSave } from '@/shared/ui/settings-kit';
import type { StatusDotTone } from '@/shared/ui/status-dot';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function invokeServerAction(
  orgId: string,
  serverId: string,
  action: 'restart' | 'stop' | 'enable',
) {
  if (action === 'restart') {
    return restartOrgLspServer(orgId, serverId);
  }
  if (action === 'stop') {
    return stopOrgLspServer(orgId, serverId);
  }
  return enableOrgLspServer(orgId, serverId);
}

function statusOf(server: OrgLspEntry): { tone: StatusDotTone; label: string } {
  if (server.disabled) {
    return { tone: 'off', label: 'Disabled' };
  }
  if (!server.binaryOk) {
    return { tone: 'wait', label: 'Not installed' };
  }
  if (!server.granted) {
    return { tone: 'wait', label: 'Needs approval' };
  }
  if (server.status === 'live') {
    return { tone: 'live', label: 'Live' };
  }
  if (server.status === 'error') {
    return { tone: 'danger', label: 'Error' };
  }
  return { tone: 'off', label: 'Off' };
}

function extensionList(server: OrgLspEntry): string {
  const extensions = Object.keys(server.extensionToLanguage);
  return extensions.length > 0 ? extensions.join(', ') : 'no extensions';
}

function problemOf(server: OrgLspEntry): { title: string; hint?: string } | undefined {
  if (server.disabled) {
    return { title: 'Server is off', hint: 'Press the play button to enable it.' };
  }
  if (!server.granted) {
    return {
      title: 'Plugin server is not approved',
      hint: 'Approve it on the Plugins settings page, then press restart here.',
    };
  }
  if (!server.binaryOk) {
    return {
      title: `Command not found: ${server.command}`,
      hint: installHint(server.command),
    };
  }
  if (server.lastError !== undefined) {
    return { title: server.lastError };
  }
  if (server.status === 'error') {
    return { title: 'Server failed to start', hint: 'Press restart to try again.' };
  }
  return undefined;
}

function installHint(command: string): string {
  if (command.includes('typescript-language-server') || command.includes('tsserver')) {
    return 'Install with: npm i -g typescript-language-server typescript';
  }
  if (command.includes('pyright')) {
    return 'Install with: pipx install pyright (or pip install pyright)';
  }
  if (command.includes('rust-analyzer')) {
    return 'Install with: rustup component add rust-analyzer';
  }
  if (command.includes('gopls')) {
    return 'Install with: go install golang.org/x/tools/gopls@latest';
  }
  return 'Make sure the command is on PATH, then press restart.';
}

export function OrgLspPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const lspQuery = useQuery(orgLspQuery(orgId));
  const servers = lspQuery.data?.servers ?? [];
  const diagnostics = lspQuery.data?.diagnostics ?? [];
  const liveCount = servers.filter(
    (server) => !server.disabled && server.binaryOk && server.status === 'live',
  ).length;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [raw, setRaw] = useState('{}');

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

  async function runServerAction(serverId: string, action: 'restart' | 'stop' | 'enable') {
    try {
      const result = await invokeServerAction(orgId, serverId, action);
      queryClient.setQueryData(orgLspQueryKey(orgId), result);
      const titles: Record<typeof action, string> = {
        restart: 'LSP server restarted',
        stop: 'LSP server stopped',
        enable: 'LSP server enabled',
      };
      toast.add({ title: titles[action], description: serverId });
    } catch (error) {
      toast.add({ title: 'Action failed', description: errorMessage(error) });
    }
  }

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

      {lspQuery.isPending && <RowListSkeleton testId="lsp-loading" />}

      {!lspQuery.isPending && servers.length === 0 && (
        <SettingsEmpty
          title="No language servers"
          description={
            <>
              Add a server in the raw config below, or install a plugin that declares{' '}
              <code className="font-mono text-[11px]">lspServers</code> from the Plugins catalog.
            </>
          }
        />
      )}

      {!lspQuery.isPending && servers.length > 0 && (
        <RowList>
          {servers.map((server) => {
            const status = statusOf(server);
            const problem = problemOf(server);
            return (
              <Row
                key={server.serverId}
                testId={`lsp-server-${server.serverId}`}
                title={server.serverId}
                muted={server.disabled}
                meta={extensionList(server)}
                status={status}
                chips={
                  <RowChip tone={server.origin === 'file' ? 'accent' : 'neutral'}>
                    {server.origin === 'file' ? (
                      <>
                        <FileCode2Icon className="size-2.5" />
                        lsp.json
                      </>
                    ) : (
                      `plugin: ${server.origin.replace(/^plugin:/, '')}`
                    )}
                  </RowChip>
                }
                onToggle={() =>
                  setExpandedId((current) => (current === server.serverId ? null : server.serverId))
                }
                expanded={expandedId === server.serverId}
                alwaysShowActions
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Restart ${server.serverId}`}
                      title="Restart"
                      onClick={() => void runServerAction(server.serverId, 'restart')}
                    >
                      <RotateCwIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={
                        server.disabled ? `Enable ${server.serverId}` : `Stop ${server.serverId}`
                      }
                      title={server.disabled ? 'Enable' : 'Stop'}
                      onClick={() =>
                        void runServerAction(server.serverId, server.disabled ? 'enable' : 'stop')
                      }
                    >
                      {server.disabled ? <PlayIcon /> : <PauseIcon />}
                    </Button>
                  </>
                }
              >
                <RowSection label="Details">
                  <RowField
                    label="Command"
                    value={[server.command, ...(server.args ?? [])].filter(Boolean).join(' ')}
                  />
                  <RowField label="Extensions" value={extensionList(server)} />
                  <RowField
                    label="Source"
                    value={
                      server.origin === 'file'
                        ? '.harnesys/lsp.json'
                        : `plugin: ${server.origin.replace(/^plugin:/, '')}`
                    }
                  />
                  {problem && (
                    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                      <p className="text-xs">{problem.title}</p>
                      {problem.hint && (
                        <p className="text-[11px] text-muted-foreground">{problem.hint}</p>
                      )}
                    </div>
                  )}
                  {!problem && status.label === 'Off' && (
                    <p className="text-muted-foreground text-xs">
                      Ready — it starts on the first editor or agent request.
                    </p>
                  )}
                </RowSection>
              </Row>
            );
          })}
        </RowList>
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
