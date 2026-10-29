import { useQuery } from '@tanstack/react-query';
import { PackageIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import { groupTools } from '@/entities/tool-catalog';
import {
  type ProjectTool,
  projectCapabilitiesQuery,
  projectMcpConfigQuery,
  projectToolsQuery,
} from '@/shared/api';
import { Row, RowHeader, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
export function ToolsPane({ projectId }: { projectId: string }) {
  const query = useQuery({
    ...projectToolsQuery(projectId),
    enabled: Boolean(projectId),
  });
  const mcpConfigQuery = useQuery({
    ...projectMcpConfigQuery(projectId),
    enabled: Boolean(projectId),
  });
  const capabilitiesQuery = useQuery({
    ...projectCapabilitiesQuery(projectId),
    enabled: Boolean(projectId),
  });
  const packs = capabilitiesQuery.data?.capabilities ?? [];
  const packToolNames = new Set(packs.flatMap((pack) => pack.tools.map((tool) => tool.name)));
  const serverIds = (mcpConfigQuery.data?.servers ?? []).map((server) => server.serverId);
  const groups = groupTools(
    (query.data?.tools ?? []).filter((tool) => !packToolNames.has(tool.name)),
    serverIds,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const loading = query.isPending || mcpConfigQuery.isPending || capabilitiesQuery.isPending;
  const total = packs.length + groups.length;
  function toggle(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }
  return (
    <div className="flex w-full flex-col gap-6" data-testid="tools-pane">
      {loading && <RowListSkeleton rows={4} testId="tools-loading" />}
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
              {packs.map((pack) => {
                const id = `pack:${pack.name}`;
                return (
                  <Row
                    key={id}
                    testId={`package-${pack.name}`}
                    icon={<PackageIcon />}
                    title={pack.name}
                    meta="pack"
                    summary={pack.description}
                    onToggle={() => toggle(id)}
                    expanded={expandedId === id}
                  >
                    <RowSection label="Tools" count={pack.tools.length}>
                      {pack.tools.map((tool) => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))}
                    </RowSection>
                    {pack.skills.length > 0 ? (
                      <RowSection label="Skills" count={pack.skills.length}>
                        {pack.skills.map((skill) => (
                          <p
                            key={skill}
                            className="truncate px-1 font-mono text-[12px] leading-snug"
                          >
                            {skill}
                          </p>
                        ))}
                      </RowSection>
                    ) : null}
                  </Row>
                );
              })}
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
function ToolItem({ tool }: { tool: ProjectTool }) {
  return (
    <RowItem
      testId={`tool-${tool.name}`}
      icon={<WrenchIcon />}
      title={tool.name}
      description={tool.description}
    />
  );
}
