import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { projectMcpConfigQuery } from '@/shared/api';
import { orgCapabilitiesQuery } from '@/shared/api/org-capabilities';
import { orgPluginsQuery } from '@/shared/api/org-plugins';
import { orgSkillsQuery } from '@/shared/api/org-skills';
import { Pane } from '@/shared/ui/capability-rows';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { isChecked } from '../model/capability-allowlist';
import { CORE_SOURCE, isSourceGranted, type PackAssignmentMap } from '../model/draft-overrides';
import { DraftPacksGrants, DraftPluginsGrants } from './draft-capabilities';
import { DraftGrantedMcpServers, DraftGrantedSkills } from './draft-loose-resources';

type CapabilitiesTab = 'packs' | 'plugins' | 'mcp' | 'skills';

interface TabCount {
  total: number;
  on: number;
}

const TAB_ITEMS: { value: CapabilitiesTab; label: string }[] = [
  { value: 'packs', label: 'Packs' },
  { value: 'plugins', label: 'Plugins' },
  { value: 'mcp', label: 'MCP' },
  { value: 'skills', label: 'Skills' },
];

export function AgentCapabilitiesPane({
  orgId,
  agentId,
  isDelegate,
  capabilities,
  enabledPlugins,
  mcpServers,
  skills,
  onCapabilitiesChange,
  onPluginsChange,
  onMcpChange,
  onSkillsChange,
}: {
  orgId: string;
  agentId: string | null;
  isDelegate: boolean;
  capabilities: PackAssignmentMap;
  enabledPlugins: Record<string, boolean>;
  mcpServers: string[];
  skills: string[];
  onCapabilitiesChange: (next: PackAssignmentMap) => void;
  onPluginsChange: (next: Record<string, boolean>) => void;
  onMcpChange: (next: string[]) => void;
  onSkillsChange: (next: string[]) => void;
}) {
  const [tab, setTab] = useState<CapabilitiesTab>('packs');
  const counts = useCapabilityCounts({
    orgId,
    isDelegate,
    capabilities,
    enabledPlugins,
    mcpServers,
    skills,
  });
  return (
    <Pane
      label="Capabilities"
      description="Sources this agent may draw tools, servers and skills from."
      testId="agent-capabilities-pane"
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as CapabilitiesTab)}>
        <TabsList className="w-full">
          {TAB_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-1 gap-1.5">
              {item.label}
              <CountBadge count={counts[item.value]} />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="min-w-0 pt-1">
        {tab === 'packs' ? (
          <DraftPacksGrants
            key={`packs-${agentId ?? 'new'}`}
            orgId={orgId}
            agentId={agentId}
            isDelegate={isDelegate}
            capabilities={capabilities}
            onCapabilitiesChange={onCapabilitiesChange}
          />
        ) : null}
        {tab === 'plugins' ? (
          <DraftPluginsGrants
            key={`plugins-${agentId ?? 'new'}`}
            orgId={orgId}
            agentId={agentId}
            enabledPlugins={enabledPlugins}
            onPluginsChange={onPluginsChange}
          />
        ) : null}
        {tab === 'mcp' ? (
          <DraftGrantedMcpServers
            key={`mcp-${agentId ?? 'new'}`}
            orgId={orgId}
            mcpServers={mcpServers}
            onChange={onMcpChange}
          />
        ) : null}
        {tab === 'skills' ? (
          <DraftGrantedSkills
            key={`skills-${agentId ?? 'new'}`}
            orgId={orgId}
            agentId={agentId ?? ''}
            skills={skills}
            onChange={onSkillsChange}
          />
        ) : null}
      </div>
    </Pane>
  );
}

function useCapabilityCounts(input: {
  orgId: string;
  isDelegate: boolean;
  capabilities: PackAssignmentMap;
  enabledPlugins: Record<string, boolean>;
  mcpServers: string[];
  skills: string[];
}) {
  const packsQuery = useQuery({
    ...orgCapabilitiesQuery(input.orgId),
    enabled: Boolean(input.orgId),
  });
  const pluginsQuery = useQuery({
    ...orgPluginsQuery(input.orgId),
    enabled: Boolean(input.orgId),
  });
  const mcpQuery = useQuery({
    ...projectMcpConfigQuery(input.orgId),
    enabled: Boolean(input.orgId),
  });
  const skillsQuery = useQuery({
    ...orgSkillsQuery(input.orgId),
    enabled: Boolean(input.orgId),
  });
  const packs = (packsQuery.data?.capabilities ?? []).filter(
    (pack) => !(input.isDelegate && pack.name === 'agents'),
  );
  const plugins = pluginsQuery.data ?? [];
  const servers = mcpQuery.data?.servers ?? [];
  const catalog = skillsQuery.data?.skills ?? [];
  const pending =
    packsQuery.isPending || pluginsQuery.isPending || mcpQuery.isPending || skillsQuery.isPending;
  const empty: TabCount = { total: 0, on: 0 };
  if (pending) {
    return { packs: empty, plugins: empty, mcp: empty, skills: empty };
  }
  return {
    packs: {
      total: packs.length,
      on: packs.filter(
        (pack) => pack.name === CORE_SOURCE || isSourceGranted(input.capabilities[pack.name]),
      ).length,
    },
    plugins: {
      total: plugins.length,
      on: plugins.filter((item) => input.enabledPlugins[item.plugin.name] === true).length,
    },
    mcp: {
      total: servers.length,
      on: servers.filter((server) => isChecked(input.mcpServers, server.serverId)).length,
    },
    skills: {
      total: catalog.length,
      on: catalog.filter((skill) => isChecked(input.skills, skill.name)).length,
    },
  };
}

function CountBadge({ count }: { count: TabCount }) {
  return (
    <span className="rounded-full bg-muted px-1.5 font-mono font-normal text-[10px] text-muted-foreground tabular-nums">
      {count.total}/{count.on}
    </span>
  );
}
