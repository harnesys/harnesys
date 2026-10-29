import type { AgentHook } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import type { PermissionMap } from 'harnesys';
import { hookGateStatus } from 'harnesys/domain';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { orgScopedAgentsQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Pane, RowList } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { newHook } from './hooks/hook-handler-editor';
import { HOOK_PRESETS } from './hooks/hook-presets';
import { HookRow } from './hooks/hook-row';
import { HookRunsPanel } from './hooks/hook-runs-panel';

export function AgentHooksPane({
  orgId,
  agentId,
  value,
  permissions,
  mcpServers,
  onChange,
}: {
  orgId: string;
  agentId: string;
  value: AgentHook[];
  permissions?: PermissionMap;
  mcpServers: string[];
  onChange: (next: AgentHook[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const agents = useQuery(orgScopedAgentsQuery(orgId));
  const agentIds = (agents.data?.items ?? [])
    .map((agent) => agent.id)
    .filter((id) => id !== agentId);
  function rowId(hook: AgentHook, index: number): string {
    return hook.id ?? `hook-${index}`;
  }
  function addHook(hook: AgentHook): void {
    const next = [...value, hook];
    onChange(next);
    setExpandedId(hook.id ?? `hook-${next.length - 1}`);
  }
  return (
    <Pane
      testId="agent-hooks-pane"
      label="Hooks"
      count={value.length}
      description="Rules that run at engine seams of every run of this agent."
      extra={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => addHook(newHook())}>
            <PlusIcon />
            Add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              <SparklesIcon />
              From template
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              {HOOK_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.id} onClick={() => addHook(preset.build())}>
                  <SparklesIcon className="size-3" />
                  {preset.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
          No hooks yet. Add one, or start from a template.
        </p>
      ) : (
        <RowList testId="agent-hooks-list">
          {value.map((hook, index) => {
            const id = rowId(hook, index);
            return (
              <HookRow
                key={id}
                hook={hook}
                gate={gateOf(hook, permissions)}
                orgId={orgId}
                agentId={agentId}
                mcpServers={mcpServers}
                agentIds={agentIds}
                expanded={expandedId === id}
                onToggle={() => setExpandedId((current) => (current === id ? null : id))}
                onChange={(next) => onChange(value.map((item, i) => (i === index ? next : item)))}
                onRemove={() => {
                  onChange(value.filter((_, i) => i !== index));
                  setExpandedId(null);
                }}
              />
            );
          })}
        </RowList>
      )}
      <HookRunsPanel orgId={orgId} agentId={agentId} />
    </Pane>
  );
}

function gateOf(hook: AgentHook, permissions: PermissionMap | undefined) {
  const status = hookGateStatus(hook.handler, permissions);
  return { status: status.status, reason: status.reason };
}
