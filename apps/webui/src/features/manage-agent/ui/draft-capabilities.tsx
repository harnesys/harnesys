import type { PluginListItem } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { orgAgentCapabilitiesQuery, orgCapabilitiesQuery } from '@/shared/api/org-capabilities';
import { orgPluginsQuery } from '@/shared/api/org-plugins';
import { RowList } from '@/shared/ui/capability-rows';
import {
  CORE_SOURCE,
  isSourceGranted,
  overrideOfAssignment,
  type PackAssignmentMap,
  setSourceGrant,
  setToolExposure,
  sourceSections,
  sourceToolRows,
  toggleDisabledTool,
} from '../model/draft-overrides';
import { AgentSourceCard } from './agent-source-card';
import { PackSettingsFields, packHasSettings } from './pack-settings';
export function DraftPacksGrants({
  orgId,
  agentId,
  isDelegate,
  capabilities,
  onCapabilitiesChange,
}: {
  orgId: string;
  agentId: string | null;
  isDelegate: boolean;
  capabilities: PackAssignmentMap;
  onCapabilitiesChange: (next: PackAssignmentMap) => void;
}) {
  const packsQuery = useQuery({
    ...orgCapabilitiesQuery(orgId),
    enabled: Boolean(orgId),
  });
  const explainQuery = useQuery(orgAgentCapabilitiesQuery(orgId, agentId));
  const view = explainQuery.data;
  const catalog = (packsQuery.data?.capabilities ?? []).filter(
    (pack) => !(isDelegate && pack.name === 'agents'),
  );
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!packsQuery.isPending && catalog.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">No capability packs.</p>
      ) : null}
      <RowList>
        {catalog.map((pack) => {
          const isCore = pack.name === CORE_SOURCE;
          const granted = isCore ? true : isSourceGranted(capabilities[pack.name]);
          const base = overrideOfAssignment(capabilities[pack.name]);
          const settingsAvailable =
            packHasSettings(pack.name, pack.hasSettings) && (isCore || granted);
          return (
            <AgentSourceCard
              key={pack.name}
              kind="pack"
              name={pack.name}
              description={pack.description}
              granted={granted}
              locked={isCore}
              lockLabel={isCore ? 'Required' : undefined}
              tools={agentId ? sourceToolRows(view, `pack:${pack.name}`, base) : []}
              toolsHint={
                agentId
                  ? 'Grant the source and save to tune its tools.'
                  : 'Save the agent to tune per-tool overrides.'
              }
              onToggleGrant={(next) =>
                onCapabilitiesChange(setSourceGrant(capabilities, pack.name, next))
              }
              onToggleTool={(tool, disable) =>
                onCapabilitiesChange(toggleDisabledTool(capabilities, pack.name, tool, disable))
              }
              onExposure={(tool, exposure) =>
                onCapabilitiesChange(setToolExposure(capabilities, pack.name, tool, exposure))
              }
              settings={
                settingsAvailable ? (
                  <PackSettingsFields
                    packName={pack.name}
                    config={{ spec: base.spec }}
                    onChange={(next) =>
                      onCapabilitiesChange({
                        ...capabilities,
                        [pack.name]: { ...base, spec: next.spec },
                      })
                    }
                  />
                ) : undefined
              }
            />
          );
        })}
      </RowList>
    </div>
  );
}

export function DraftPluginsGrants({
  orgId,
  agentId,
  enabledPlugins,
  onPluginsChange,
}: {
  orgId: string;
  agentId: string | null;
  enabledPlugins: Record<string, boolean>;
  onPluginsChange: (next: Record<string, boolean>) => void;
}) {
  const pluginsListQuery = useQuery(orgPluginsQuery(orgId));
  const explainQuery = useQuery(orgAgentCapabilitiesQuery(orgId, agentId));
  const view = explainQuery.data;
  const plugins = pluginsListQuery.data ?? [];
  function togglePlugin(name: string, enable: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of pluginsListQuery.data ?? []) {
      next[item.plugin.name] = enabledPlugins[item.plugin.name] ?? false;
    }
    next[name] = enable;
    onPluginsChange(next);
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!pluginsListQuery.isPending && plugins.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">No org plugins installed.</p>
      ) : null}
      <RowList>
        {plugins.map((item) => (
          <AgentSourceCard
            key={item.plugin.name}
            kind="plugin"
            name={item.plugin.name}
            description={item.plugin.description ?? pluginInventory(item)}
            granted={enabledPlugins[item.plugin.name] ?? false}
            sections={agentId ? sourceSections(view, `plugin:${item.plugin.name}`) : []}
            sectionsEmptyHint={
              agentId
                ? 'No skills, servers or hooks from this plugin.'
                : 'Save the agent to list granted skills, servers and hooks.'
            }
            onToggleGrant={(next) => togglePlugin(item.plugin.name, next)}
          />
        ))}
      </RowList>
    </div>
  );
}

function pluginInventory(item: PluginListItem): string {
  const plugin = item.plugin;
  return `${plugin.skillCount} skills · ${plugin.hookCount} hooks · ${plugin.agentCount} agents · ${plugin.commandCount} commands`;
}
