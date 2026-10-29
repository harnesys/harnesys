import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { projectMcpQuery } from '@/shared/api';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';
import { Section, SectionEmpty } from './section';

export function McpInspector({ agent }: { agent: Agent }) {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const query = useQuery({
    ...projectMcpQuery(projectId ?? ''),
    enabled: Boolean(projectId),
  });
  const catalog = query.data?.servers ?? [];
  const enabledCount = catalog.filter((server) =>
    agent.mcpServers.includes(server.serverId),
  ).length;
  let content: ReactNode;
  if (query.isPending) {
    content = (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  } else if (catalog.length === 0) {
    content = <SectionEmpty>No MCP servers in this project.</SectionEmpty>;
  } else {
    content = (
      <div className="flex flex-col gap-0.5">
        {catalog.map((server) => {
          const enabled = agent.mcpServers.includes(server.serverId);
          const status = mcpStatus(enabled, server.connected);
          return (
            <div
              key={server.serverId}
              className={cn(
                'flex items-center gap-2 rounded-md px-1.5 py-1',
                !enabled && 'opacity-55',
              )}
            >
              <StatusDot tone={status.tone} label={status.text} />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {server.serverId}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {status.text}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <Section label="MCP" hint={enabledCount > 0 ? String(enabledCount) : undefined}>
      {content}
    </Section>
  );
}

function mcpStatus(
  enabled: boolean,
  connected: boolean,
): {
  tone: StatusDotTone;
  text: 'connected' | 'offline' | 'off';
} {
  if (!enabled) {
    return { tone: 'off', text: 'off' };
  }
  if (connected) {
    return { tone: 'live', text: 'connected' };
  }
  return { tone: 'idle', text: 'offline' };
}
