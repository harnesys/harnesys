import type { OrgTool, PackCatalogEntry } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { PackageIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import { groupTools } from '@/entities/tool-catalog';
import { orgCapabilitiesQuery, orgToolsQuery } from '@/shared/api/org-capabilities';
import { orgMcpConfigQuery } from '@/shared/api/org-mcp';
import { Row, RowHeader, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';

export function OrgPackagesPane({ orgId }: { orgId: string }) {
  const toolsQuery = useQuery({
    ...orgToolsQuery(orgId),
    enabled: Boolean(orgId),
  });
  const mcpConfigQuery = useQuery({
    ...orgMcpConfigQuery(orgId),
    enabled: Boolean(orgId),
  });
  const capabilitiesQuery = useQuery({
    ...orgCapabilitiesQuery(orgId),
    enabled: Boolean(orgId),
  });
  const packs = capabilitiesQuery.data?.capabilities ?? [];
  const packToolNames = new Set(packs.flatMap((pack) => pack.tools.map((tool) => tool.name)));
  const serverIds = (mcpConfigQuery.data?.servers ?? []).map((server) => server.serverId);
  const groups = groupTools(
    (toolsQuery.data?.tools ?? [])
      .filter((tool) => !packToolNames.has(tool.name))
      .map(toProjectTool),
    serverIds,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const loading = toolsQuery.isPending || mcpConfigQuery.isPending || capabilitiesQuery.isPending;
  const total = packs.length + groups.length;

  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-packages-pane">
      {loading && <RowListSkeleton rows={4} testId="packages-loading" />}
      {!loading &&
        (total === 0 ? (
          <SettingsEmpty
            title="No packages available"
            description="Install a plugin or add packs to see capability packages here."
          />
        ) : (
          <>
            <RowHeader label="Packages" count={total} />
            <RowList>
              {packs.map((pack) => (
                <PackRow
                  key={pack.name}
                  pack={pack}
                  expanded={expandedId === `pack:${pack.name}`}
                  onToggle={() => toggle(`pack:${pack.name}`)}
                />
              ))}
              {groups.map((group) => {
                const id = `group:${group.id}`;
                return (
                  <Row
                    key={id}
                    testId={`package-${group.id}`}
                    icon={<WrenchIcon />}
                    title={group.label}
                    meta={`${group.tools.length} tools`}
                    summary={group.hint ?? group.tools.map((tool) => tool.name).join(', ')}
                    onToggle={() => toggle(id)}
                    expanded={expandedId === id}
                  >
                    <RowSection label="Tools" count={group.tools.length}>
                      {group.tools.map((tool) => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))}
                    </RowSection>
                  </Row>
                );
              })}
            </RowList>
          </>
        ))}
    </div>
  );
}

function PackRow({
  pack,
  expanded,
  onToggle,
}: {
  pack: PackCatalogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Row
      testId={`package-${pack.name}`}
      icon={<PackageIcon />}
      title={pack.name}
      meta="pack"
      summary={pack.description}
      onToggle={onToggle}
      expanded={expanded}
    >
      <RowSection label="Tools" count={pack.tools.length}>
        {pack.tools.map((tool) => (
          <ToolItem key={tool.name} tool={tool} />
        ))}
      </RowSection>
      {pack.skills.length > 0 ? (
        <RowSection label="Skills" count={pack.skills.length}>
          {pack.skills.map((skill) => (
            <p key={skill} className="truncate px-1 font-mono text-[12px] leading-snug">
              {skill}
            </p>
          ))}
        </RowSection>
      ) : null}
    </Row>
  );
}

function ToolItem({ tool }: { tool: { name: string; description: string } }) {
  return (
    <RowItem
      testId={`tool-${tool.name}`}
      icon={<WrenchIcon />}
      title={tool.name}
      description={tool.description}
    />
  );
}

function toProjectTool(tool: OrgTool) {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.group !== undefined ? { group: tool.group } : {}),
  };
}
