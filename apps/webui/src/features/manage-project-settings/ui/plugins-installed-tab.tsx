import type {
  GrantClass,
  PluginDiagnostic,
  PluginListItem,
  PluginOptionValue,
} from '@harnesys/studio-shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PuzzleIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  changedOptionValues,
  confirmRemovePlugin,
  grantedClasses,
  openEnablePluginDialog,
  openInstallPluginDialog,
  optionDrafts,
  PluginComponentMatrix,
  PluginGrantCheckboxes,
  type PluginOptionDraft,
  PluginOptionsFields,
  patchOptionDraft,
} from '@/features/manage-plugins';
import {
  approvePluginServer,
  listPlugins,
  pluginsQuery,
  pluginsQueryKeyFor,
  projectMcpConfigQueryKey,
  projectMcpQueryKey,
  removePlugin,
  setPluginGrants,
  setPluginOption,
  updatePlugin,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Row,
  RowChip,
  RowField,
  RowHeader,
  RowList,
  RowSection,
} from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

const SERVER_APPROVAL_REASON = 'needs_server_approval';
const MCP_SERVER_KIND = 'mcp-server';
export function PluginsInstalledTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const pluginsListQuery = useQuery(pluginsQuery(projectId));
  const items = pluginsListQuery.data ?? [];
  const [expandedName, setExpandedName] = useState<string | null>(null);
  async function invalidatePlugins() {
    await invalidatePluginAndMcp(queryClient, projectId);
  }
  const reload = useMutation({
    mutationFn: () => listPlugins(projectId),
    onSuccess: async () => {
      await invalidatePlugins();
      toast.add({ title: 'Plugins reloaded' });
    },
  });
  const update = useMutation({
    mutationFn: (name: string) => updatePlugin(projectId, name),
    onSuccess: async (result) => {
      await invalidatePlugins();
      toast.add({ title: 'Plugin updated', description: result.plugin.name });
    },
    onError: (error) => {
      toast.add({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
  const remove = useMutation({
    mutationFn: (name: string) => removePlugin(projectId, name),
    onSuccess: async (_result, name) => {
      await invalidatePlugins();
      toast.add({ title: 'Plugin removed', description: name });
    },
  });
  const busy = update.isPending || remove.isPending;
  return (
    <div className="flex flex-col gap-2" data-testid="plugins-installed-tab">
      <RowHeader label="Installed" count={pluginsListQuery.isPending ? undefined : items.length}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RefreshCwIcon />
          Reload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            void openInstallPluginDialog(projectId).then(async (result) => {
              if (!result) {
                return;
              }
              await invalidatePlugins();
              toast.add({ title: 'Plugin installed', description: result.plugin.name });
            });
          }}
        >
          <PlusIcon />
          Install from git
        </Button>
      </RowHeader>

      {pluginsListQuery.isPending && <RowListSkeleton testId="plugins-loading" />}
      {!pluginsListQuery.isPending &&
        (items.length === 0 ? (
          <SettingsEmpty
            title="No plugins yet"
            description="Install from git (`obra/superpowers`) or open Discover to install from a marketplace."
          />
        ) : (
          <RowList>
            {items.map((item) => {
              const plugin = item.plugin;
              const expanded = expandedName === plugin.name;
              const inventory = `${plugin.skillCount} skills · ${plugin.hookCount} hooks · ${plugin.mcpServerCount} mcp · ${plugin.agentCount} agents · ${plugin.commandCount} commands`;
              return (
                <Row
                  key={plugin.name}
                  testId={`plugin-${plugin.name}`}
                  icon={<PuzzleIcon />}
                  title={plugin.name}
                  meta={plugin.version}
                  summary={inventory}
                  chips={
                    <>
                      <RowChip tone="accent">here</RowChip>
                      <RowChip>
                        {plugin.format === 'unknown' ? 'unattested' : plugin.format}
                      </RowChip>
                      <DiagnosticChip diagnostics={item.diagnostics} />
                    </>
                  }
                  onToggle={() =>
                    setExpandedName((current) => (current === plugin.name ? null : plugin.name))
                  }
                  expanded={expanded}
                  actions={
                    <>
                      {projectId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={busy}
                          onClick={() => {
                            void openEnablePluginDialog(plugin, projectId).then(async (result) => {
                              if (!result) {
                                return;
                              }
                              await invalidatePlugins();
                              toast.add({ title: 'Plugin saved', description: result.name });
                            });
                          }}
                        >
                          Configure
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label={`Update ${plugin.name}`}
                        title={`Update ${plugin.name}`}
                        disabled={busy}
                        onClick={() => update.mutate(plugin.name)}
                      >
                        <RefreshCwIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${plugin.name}`}
                        disabled={busy}
                        onClick={() => {
                          void confirmRemovePlugin(plugin.name).then((confirmed) => {
                            if (confirmed) {
                              remove.mutate(plugin.name);
                            }
                          });
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </>
                  }
                >
                  {expanded ? <PluginDetail item={item} projectId={projectId ?? ''} /> : null}
                </Row>
              );
            })}
          </RowList>
        ))}
    </div>
  );
}
function PluginDetail({ item, projectId }: { item: PluginListItem; projectId: string }) {
  const plugin = item.plugin;
  const queryClient = useQueryClient();
  const [grants, setGrants] = useState(() => plugin.grants);
  const [drafts, setDrafts] = useState<PluginOptionDraft[]>(() => optionDrafts(plugin));
  const grantsMutation = useMutation({
    mutationFn: (classes: GrantClass[]) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return setPluginGrants(projectId, plugin.name, { classes });
    },
    onSuccess: async () => {
      await invalidatePluginAndMcp(queryClient, projectId);
    },
  });
  const approveMutation = useMutation({
    mutationFn: (serverId: string) => approvePluginServer(projectId, plugin.name, { serverId }),
    onSuccess: async (_result, serverId) => {
      await invalidatePluginAndMcp(queryClient, projectId);
      toast.add({ title: 'Server approved', description: serverId });
    },
  });
  const optionsMutation = useMutation({
    mutationFn: (
      changes: {
        key: string;
        value: PluginOptionValue;
      }[],
    ) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return Promise.all(changes.map((change) => setPluginOption(projectId, plugin.name, change)));
    },
    onSuccess: async () => {
      await invalidatePluginAndMcp(queryClient, projectId);
      setDrafts((current) =>
        current.map((draft) =>
          draft.sensitive ? { ...draft, value: '' } : { ...draft, current: draft.value },
        ),
      );
      toast.add({ title: 'Options saved' });
    },
  });
  const busy = grantsMutation.isPending || approveMutation.isPending || optionsMutation.isPending;
  const grantList = grantedClasses(grants);
  const optionChanges = changedOptionValues(drafts);
  return (
    <div className="flex flex-col pb-1" data-testid={`plugin-detail-${plugin.name}`}>
      {plugin.description ? (
        <p className="wrap-anywhere px-1 pt-1 text-muted-foreground text-xs leading-4">
          {plugin.description}
        </p>
      ) : null}

      <RowSection label="Source">
        <RowField label="git" value={plugin.source} />
        <RowField
          label="revision"
          value={plugin.revision ? plugin.revision.slice(0, 12) : 'unknown'}
        />
        {plugin.registryId ? <RowField label="registry" value={plugin.registryId} /> : null}
        <RowField label="node" value={plugin.projectId} />
      </RowSection>

      <RowSection label="Components" count={plugin.components.length}>
        <div className="px-1">
          <PluginComponentMatrix
            components={plugin.components}
            renderAction={(component) =>
              component.kind === MCP_SERVER_KIND &&
              component.status === 'blocked_by_grant' &&
              component.inertReason === SERVER_APPROVAL_REASON ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => approveMutation.mutate(component.source.pointer)}
                >
                  Approve
                </Button>
              ) : null
            }
          />
        </div>
      </RowSection>

      {projectId ? (
        <RowSection label="Grants">
          <div className="px-1">
            <PluginGrantCheckboxes
              selection={grants}
              disabled={busy}
              onChange={(next) => {
                setGrants(next);
                grantsMutation.mutate(grantedClasses(next));
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {grantList.length > 0
                ? `Allowed: ${grantList.join(', ')}. Blocked components go live once their class is granted.`
                : 'Nothing allowed — content this plugin contributes stays inactive in this project.'}
            </p>
          </div>
        </RowSection>
      ) : null}

      {drafts.length > 0 ? (
        <RowSection label="Settings">
          <div className="px-1">
            <PluginOptionsFields
              drafts={drafts}
              onChange={(key, value) =>
                setDrafts((current) => patchOptionDraft(current, key, value))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 self-start"
              disabled={busy || optionChanges.length === 0}
              onClick={() => optionsMutation.mutate(optionChanges)}
            >
              Save options
            </Button>
          </div>
        </RowSection>
      ) : null}

      {item.diagnostics.length > 0 ? (
        <RowSection label="Diagnostics" count={item.diagnostics.length}>
          {item.diagnostics.map((diagnostic, index) => (
            <DiagnosticLine
              key={`${diagnostic.level}:${diagnostic.code}:${index}`}
              diagnostic={diagnostic}
            />
          ))}
        </RowSection>
      ) : null}
    </div>
  );
}
async function invalidatePluginAndMcp(queryClient: QueryClient, projectId?: string | null) {
  if (!projectId) {
    return;
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: pluginsQueryKeyFor(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectMcpConfigQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectMcpQueryKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: ['orgs', projectId, 'mcp'] }),
    queryClient.invalidateQueries({ queryKey: ['orgs', projectId, 'plugins'] }),
  ]);
}
function DiagnosticChip({ diagnostics }: { diagnostics: PluginDiagnostic[] }) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error').length;
  const warnings = diagnostics.length - errors;
  return (
    <>
      {errors > 0 ? (
        <RowChip tone="danger">
          {errors} error{errors === 1 ? '' : 's'}
        </RowChip>
      ) : null}
      {warnings > 0 ? (
        <RowChip tone="danger">
          {warnings} warning{warnings === 1 ? '' : 's'}
        </RowChip>
      ) : null}
    </>
  );
}
function DiagnosticLine({ diagnostic }: { diagnostic: PluginDiagnostic }) {
  return (
    <div className="flex min-w-0 gap-2 px-1 py-0.5">
      <span
        className={
          diagnostic.level === 'error'
            ? 'w-16 shrink-0 pt-px font-mono text-[11px] text-destructive'
            : 'w-16 shrink-0 pt-px font-mono text-[11px] text-muted-foreground'
        }
      >
        {diagnostic.level}
      </span>
      <span className="wrap-anywhere min-w-0 text-[12px] leading-snug">
        {diagnostic.code} — {diagnostic.message}
        {diagnostic.path ? (
          <span className="text-muted-foreground"> · {diagnostic.path}</span>
        ) : null}
      </span>
    </div>
  );
}
