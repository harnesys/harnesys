import type { AgentCatalogItem } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, PlusIcon, PuzzleIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import { AgentRecordAvatar, useAgentStore } from '@/entities/agent';
import { presetsQuery } from '@/shared/api';
import { orgPluginsQuery } from '@/shared/api/org-plugins';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { Pane, Row, RowChip, RowList, RowSection } from '@/shared/ui/capability-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { createAgentFromPreset } from '../model/create-agent-from-preset';
import { deleteAgent } from '../model/delete-agent';

interface AgentSubagentsPaneProps {
  orgId: string;
  parentId: string;
  enabledPlugins: Record<string, boolean>;
  onConfigure: (agent: Agent) => void;
}
export function AgentSubagentsPane({
  orgId,
  parentId,
  enabledPlugins,
  onConfigure,
}: AgentSubagentsPaneProps) {
  const delegates = useAgentStore(
    useShallow((state) => state.items.filter((item) => item.parentId === parentId)),
  );
  const pluginsListQuery = useQuery({
    ...orgPluginsQuery(orgId),
    enabled: Boolean(orgId),
  });
  const pluginSections = (pluginsListQuery.data ?? [])
    .filter((item) => enabledPlugins[item.plugin.name] === true)
    .map((item) => ({
      plugin: item.plugin.name,
      agents: item.plugin.components.filter(
        (component) => component.kind === 'agent' && component.status === 'native',
      ),
    }))
    .filter((section) => section.agents.length > 0)
    .sort((a, b) => a.plugin.localeCompare(b.plugin));
  const agentPresetsQuery = useQuery(presetsQuery({ kind: 'agent' }));
  const presets = (agentPresetsQuery.data ?? []).filter(
    (preset): preset is AgentCatalogItem => preset.kind === 'agent',
  );
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const deleteResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmDelete = (delegate: Agent): Promise<boolean> =>
    new Promise((resolve) => {
      deleteResolver.current = resolve;
      setPendingDelete(delegate);
    });
  const settleDelete = (confirmed: boolean): void => {
    deleteResolver.current?.(confirmed);
    deleteResolver.current = null;
    setPendingDelete(null);
  };
  const addFromPreset = async (presetId: string) => {
    setCreating(true);
    try {
      const result = await createAgentFromPreset(orgId, presetId, { parentId });
      if (result) {
        toast.add({ title: 'Subagent added' });
      }
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not add subagent',
      });
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <Pane
        testId="agent-subagents-pane"
        label="Subagents"
        count={delegates.length + pluginSections.reduce((n, s) => n + s.agents.length, 0)}
        description="Spawn targets for this agent."
        extra={
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={creating}
              render={<Button type="button" variant="ghost" size="sm" />}
            >
              <PlusIcon />
              Add from preset
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {presets.length === 0 ? (
                <DropdownMenuItem disabled>
                  {agentPresetsQuery.isLoading ? 'Loading…' : 'No presets found'}
                </DropdownMenuItem>
              ) : (
                presets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    onClick={() => {
                      void addFromPreset(preset.id);
                    }}
                  >
                    <SparklesIcon className="size-3" />
                    {preset.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {delegates.length === 0 && pluginSections.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
            No subagents yet.
          </p>
        ) : null}
        {delegates.length > 0 ? (
          <RowSection label="Direct" count={delegates.length}>
            <RowList>
              {delegates.map((delegate) => (
                <SubagentRow
                  key={delegate.id}
                  agent={delegate}
                  onOpen={() => onConfigure(delegate)}
                  onRemove={() => {
                    void confirmDelete(delegate).then(async (confirmed) => {
                      if (!confirmed) {
                        return;
                      }
                      await deleteAgent(orgId, delegate.id);
                    });
                  }}
                />
              ))}
            </RowList>
          </RowSection>
        ) : null}
        {pluginSections.map((section) => (
          <RowSection key={section.plugin} label={section.plugin} count={section.agents.length}>
            <RowList>
              {section.agents.map((agent) => (
                <PluginAgentRow key={agent.source.file} name={agentFileName(agent.source.file)} />
              ))}
            </RowList>
          </RowSection>
        ))}
      </Pane>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            settleDelete(false);
          }
        }}
      >
        <AlertDialogContent size="sm" data-testid="delete-subagent-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This subagent is removed from the parent. Spawn history on threads is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleDelete(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => settleDelete(true)}>
              Delete subagent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function agentFileName(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  return base.replace(/\.md$/, '') || file;
}
function PluginAgentRow({ name }: { name: string }) {
  return (
    <Row
      testId={`draft-plugin-agent-${name}`}
      icon={<PuzzleIcon />}
      title={name}
      mono={false}
      chips={<RowChip>plugin</RowChip>}
      summary="Provided by the plugin; configured in the plugin itself."
    />
  );
}
function SubagentRow({
  agent,
  onOpen,
  onRemove,
}: {
  agent: Agent;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="group/row -mx-2 rounded-md px-2 transition-colors hover:bg-muted/40"
      data-testid={`draft-subagent-${agent.id}`}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={onOpen}
          title={`Configure ${agent.name}`}
        >
          <AgentRecordAvatar agent={agent} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-sm leading-5">{agent.name}</span>
              {agent.role ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                  {agent.role}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-muted-foreground text-xs leading-4">
              {agent.instructions.trim() || 'No instructions yet.'}
            </span>
          </span>
        </button>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${agent.name}`}
          className="opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
