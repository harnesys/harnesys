import type { OrgSkill } from '@harnesys/contracts';
import type { ProjectMcpConfigServer, ProjectMcpServer } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { PuzzleIcon, ServerIcon, WrenchIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { projectMcpConfigQuery, projectMcpQuery } from '@/shared/api';
import { effectiveSkillsQuery, orgSkillsQuery } from '@/shared/api/org-skills';
import { Row, RowChip, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import type { StatusDotTone } from '@/shared/ui/status-dot';
import { Switch } from '@/shared/ui/switch';
import {
  isChecked,
  mcpServerPluginOf,
  nextAllowlist,
  skillPluginOf,
  stripPluginPrefix,
} from '../model/capability-allowlist';

interface Group<T> {
  plugin: string | null;
  label: string;
  items: T[];
}
function buildGroups<T>(items: T[], pluginOf: (item: T) => string | null): Group<T>[] {
  const direct: T[] = [];
  const byPlugin = new Map<string, T[]>();
  for (const item of items) {
    const plugin = pluginOf(item);
    if (plugin === null) {
      direct.push(item);
    } else {
      const bucket = byPlugin.get(plugin);
      if (bucket) {
        bucket.push(item);
      } else {
        byPlugin.set(plugin, [item]);
      }
    }
  }
  const groups: Group<T>[] = [{ plugin: null, label: 'Direct', items: direct }];
  for (const [plugin, bucket] of [...byPlugin].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ plugin, label: plugin, items: bucket });
  }
  return groups;
}
export function DraftGrantedSkills({
  orgId,
  agentId,
  skills,
  onChange,
}: {
  orgId: string;
  agentId: string;
  skills: string[];
  onChange: (nextSkills: string[]) => void;
}) {
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null);
  const effectiveQuery = useQuery({
    ...effectiveSkillsQuery(orgId, agentId),
    enabled: Boolean(orgId) && Boolean(agentId),
  });
  const orgCatalogQuery = useQuery({
    ...orgSkillsQuery(orgId),
    enabled: Boolean(orgId) && !agentId,
  });
  const catalog: OrgSkill[] =
    agentId !== '' ? (effectiveQuery.data?.skills ?? []) : (orgCatalogQuery.data?.skills ?? []);
  const catalogPending = agentId !== '' ? effectiveQuery.isPending : orgCatalogQuery.isPending;
  const togglable = catalog.filter((skill) => skill.origin.kind !== 'source');
  const sourceSkills = catalog.filter((skill) => skill.origin.kind === 'source');
  const togglableNames = togglable.map((skill) => skill.name);
  const groups = buildGroups(
    togglable,
    (skill) =>
      skillPluginOf(skill.name) ??
      (skill.origin.kind === 'plugin' ? skill.origin.pluginName : null),
  );
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!catalogPending && catalog.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          No skills in org skills or plugins.
        </p>
      ) : null}
      {groups.map((group) => (
        <SectionGroup key={group.label} label={group.label} count={group.items.length}>
          <RowList>
            {group.items.map((skill) => {
              const hasDetail = Boolean(skill.description);
              const expanded = expandedSkillName === skill.name;
              return (
                <Row
                  key={skill.name}
                  testId={`draft-skill-${skill.name}`}
                  icon={<WrenchIcon />}
                  title={group.plugin ? stripPluginPrefix(skill.name, group.plugin) : skill.name}
                  meta="skill"
                  summary={skill.description || skill.whenToUse}
                  onToggle={
                    hasDetail
                      ? () =>
                          setExpandedSkillName((current) =>
                            current === skill.name ? null : skill.name,
                          )
                      : undefined
                  }
                  expanded={expanded && hasDetail}
                  actions={
                    <Switch
                      size="sm"
                      checked={isChecked(skills, skill.name)}
                      onCheckedChange={(value) =>
                        onChange(nextAllowlist(togglableNames, skills, skill.name, Boolean(value)))
                      }
                    />
                  }
                  alwaysShowActions
                >
                  {skill.description ? (
                    <RowSection label="Description">
                      <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
                        {skill.description}
                      </p>
                    </RowSection>
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        </SectionGroup>
      ))}
      {sourceSkills.length > 0 ? (
        <SectionGroup label="Sources" count={sourceSkills.length}>
          <RowList>
            {sourceSkills.map((skill) =>
              skill.origin.kind === 'source' ? (
                <Row
                  key={`source-${skill.name}`}
                  testId={`draft-skill-source-${skill.name}`}
                  icon={<WrenchIcon />}
                  title={skill.name}
                  meta="skill"
                  muted={!skill.loadable}
                  summary={skill.description || skill.whenToUse}
                  chips={
                    <RowChip testId={`draft-skill-source-chip-${skill.name}`}>
                      auto · {skill.origin.sourceName}
                    </RowChip>
                  }
                />
              ) : null,
            )}
          </RowList>
        </SectionGroup>
      ) : null}
    </div>
  );
}
export function DraftGrantedMcpServers({
  orgId,
  mcpServers,
  onChange,
}: {
  orgId: string;
  mcpServers: string[];
  onChange: (nextServers: string[]) => void;
}) {
  const configQuery = useQuery({
    ...projectMcpConfigQuery(orgId),
    enabled: Boolean(orgId),
  });
  const liveQuery = useQuery({
    ...projectMcpQuery(orgId),
    enabled: Boolean(orgId),
  });
  const servers = configQuery.data?.servers ?? [];
  const liveById = new Map((liveQuery.data?.servers ?? []).map((row) => [row.serverId, row]));
  const groups = buildGroups(servers, (server) => mcpServerPluginOf(server.serverId));
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!configQuery.isPending && servers.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          No servers in org mcp.json or plugins.
        </p>
      ) : null}
      {groups.map((group) => (
        <SectionGroup key={group.label} label={group.label} count={group.items.length}>
          <RowList>
            {group.items.map((server) => (
              <DraftMcpServerRow
                key={server.serverId}
                server={server}
                live={liveById.get(server.serverId)}
                groupPlugin={group.plugin}
                checked={isChecked(mcpServers, server.serverId)}
                expanded={expandedServerId === server.serverId}
                onToggle={() =>
                  setExpandedServerId((current) =>
                    current === server.serverId ? null : server.serverId,
                  )
                }
                onCheckedChange={(value) =>
                  onChange(
                    nextAllowlist(
                      servers.map((item) => item.serverId),
                      mcpServers,
                      server.serverId,
                      value,
                    ),
                  )
                }
              />
            ))}
          </RowList>
        </SectionGroup>
      ))}
    </div>
  );
}

function DraftMcpServerRow({
  server,
  live,
  groupPlugin,
  checked,
  expanded,
  onToggle,
  onCheckedChange,
}: {
  server: ProjectMcpConfigServer;
  live: ProjectMcpServer | undefined;
  groupPlugin: string | null;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCheckedChange: (value: boolean) => void;
}) {
  const status = mcpRowStatus(server);
  return (
    <Row
      testId={`draft-mcp-${server.serverId}`}
      icon={server.origin.kind === 'plugin' ? <PuzzleIcon /> : <ServerIcon />}
      title={groupPlugin ? stripPluginPrefix(server.serverId, groupPlugin) : server.serverId}
      meta={server.transport}
      status={status}
      muted={!checked || !server.enabled}
      summary={`${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}`}
      onToggle={onToggle}
      expanded={expanded}
      actions={<Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />}
      alwaysShowActions
    >
      <RowSection label="Tools" count={live?.tools.length ?? 0}>
        {!live || live.tools.length === 0 ? (
          <p className="px-1 text-muted-foreground text-xs">
            {server.enabled
              ? 'No tools on this server.'
              : 'Server is disabled, start it in org MCP settings.'}
          </p>
        ) : (
          live.tools.map((tool) => (
            <RowItem
              key={tool.name}
              testId={`draft-mcp-tool-${tool.name}`}
              title={shortToolName(tool.name)}
              description={tool.description}
            />
          ))
        )}
      </RowSection>
      <RowSection label="Resources" count={live?.resources.length ?? 0}>
        {!live || live.resources.length === 0 ? (
          <p className="px-1 text-muted-foreground text-xs">No resources exposed.</p>
        ) : (
          live.resources.map((resource) => (
            <RowItem
              key={resource.uri}
              testId={`draft-mcp-resource-${resource.uri}`}
              title={resource.name}
              description={[resource.mimeType, resource.uri].filter(Boolean).join(' · ')}
            />
          ))
        )}
      </RowSection>
    </Row>
  );
}
function shortToolName(name: string): string {
  return name.includes('__') ? name.split('__').slice(1).join('__') : name;
}
function mcpRowStatus(server: ProjectMcpConfigServer): {
  tone: StatusDotTone;
  label: string;
} {
  if (!server.enabled) {
    return { tone: 'off', label: 'Disabled' };
  }
  return server.connected
    ? { tone: 'live', label: 'Connected' }
    : { tone: 'danger', label: 'Offline' };
}
function SectionGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline gap-1.5 pt-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
        <span className="font-mono font-normal normal-case tabular-nums">{count}</span>
      </p>
      {children}
    </div>
  );
}
