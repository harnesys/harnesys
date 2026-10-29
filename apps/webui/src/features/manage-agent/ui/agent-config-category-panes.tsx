import type { AgentSourceLevel } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import type { MutableRefObject } from 'react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { memoryStatusQuery } from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { Pane } from '@/shared/ui/capability-rows';
import type { AgentCapabilitiesDraft } from '../model/agent-config';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';
import type { StudioGraphDocument } from '../model/agent-graph-document';
import { AgentCapabilitiesPane } from './agent-capabilities-pane';
import type { AgentConfigCategory } from './agent-config-nav';
import { AgentIdentityPane, AgentLimitsPane, AgentModelPane } from './agent-config-panes';
import { AgentConnectorsPane } from './agent-connectors-pane';
import { AgentExecutionPane } from './agent-execution-pane';
import { AgentGraphPane } from './agent-graph-pane';
import { AgentHooksPane } from './agent-hooks-pane';
import { AgentModesPane } from './agent-modes-pane';
import { AgentPermissionsPane } from './agent-permissions-pane';
import { AgentRulesPane } from './agent-rules-pane';
import { AgentSourcesPane } from './agent-sources-pane';
import { AgentSubagentsPane } from './agent-subagents-pane';
import { DraftCompaction } from './draft-compaction';
import { AgentMemoryPolicyPane } from './memory-policy-pane';

interface AgentConfigCategoryPanesProps {
  category: AgentConfigCategory;
  form: UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;
  orgId: string;
  activeAgent: Agent | null;
  showSubagents: boolean;
  isDelegate: boolean;
  graphDoc: StudioGraphDocument;
  graphDocRef: MutableRefObject<StudioGraphDocument>;
  graphTouchedRef: MutableRefObject<boolean>;
  setGraphDoc: (next: StudioGraphDocument) => void;
  capabilities: AgentCapabilitiesDraft;
  onCapabilitiesPatch: (patch: Partial<AgentCapabilitiesDraft>) => void;
  sharedSourceIds: string[];
  onSharedSourceIdsChange: (next: string[]) => void;
  sourceLevels: Record<string, AgentSourceLevel>;
  onSourceLevelsChange: (next: Record<string, AgentSourceLevel>) => void;
  onOpenSubagent: (agent: Agent) => void;
}
export function AgentConfigCategoryPanes({
  category,
  form,
  orgId,
  activeAgent,
  showSubagents,
  isDelegate,
  graphDoc,
  graphDocRef,
  graphTouchedRef,
  setGraphDoc,
  capabilities,
  onCapabilitiesPatch,
  sharedSourceIds,
  onSharedSourceIdsChange,
  sourceLevels,
  onSourceLevelsChange,
  onOpenSubagent,
}: AgentConfigCategoryPanesProps) {
  const permissions = useWatch({ control: form.control, name: 'permissions' });
  const memoryStatus = useQuery(memoryStatusQuery(orgId));
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto',
        // category === 'graph' || category === 'identity' ? 'overflow-hidden' : 'pr-1',
      )}
    >
      <Pane
        sticky={false}
        className={cn(category === 'identity' ? 'min-h-0 flex-1' : 'hidden')}
        label="Identity"
        description="Name, role and system prompt of this agent."
      >
        <AgentIdentityPane form={form} />
      </Pane>
      <Pane
        className={cn(category !== 'model' && 'hidden')}
        label="Model"
        description="Model, effort and generation parameters."
      >
        <AgentModelPane form={form} orgId={orgId} />
      </Pane>
      <div className={cn('flex flex-col gap-6', category !== 'access' && 'hidden')}>
        <Pane
          label="Shared sources"
          description="Folders this agent can see, and how much it can change them."
        >
          <AgentSourcesPane
            orgId={orgId}
            value={sharedSourceIds}
            levels={sourceLevels}
            onChange={onSharedSourceIdsChange}
            onLevelsChange={onSourceLevelsChange}
          />
        </Pane>
        <Pane label="File rules" description="Read and edit outside the run's working directory.">
          <AgentRulesPane orgId={orgId} agentId={activeAgent?.id ?? null} />
        </Pane>
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <AgentPermissionsPane
              value={field.value ?? null}
              isDelegate={isDelegate}
              onChange={(next) => field.onChange(next)}
            />
          )}
        />
      </div>
      <div className={cn(category !== 'modes' && 'hidden')}>
        <AgentModesPane
          form={form}
          orgId={orgId}
          activeAgent={activeAgent}
          active={category === 'modes'}
        />
      </div>
      <div className={cn(category !== 'capabilities' && 'hidden')}>
        <AgentCapabilitiesPane
          key={`capabilities-${activeAgent?.id ?? 'new'}`}
          orgId={orgId}
          agentId={activeAgent?.id ?? null}
          isDelegate={isDelegate}
          capabilities={capabilities.capabilities ?? {}}
          enabledPlugins={capabilities.enabledPlugins ?? {}}
          mcpServers={capabilities.mcpServers ?? []}
          skills={capabilities.skills ?? []}
          onCapabilitiesChange={(nextCapabilities) => {
            onCapabilitiesPatch({ capabilities: nextCapabilities });
          }}
          onPluginsChange={(enabledPlugins) => {
            onCapabilitiesPatch({ enabledPlugins });
          }}
          onMcpChange={(mcpServers) => {
            onCapabilitiesPatch({ mcpServers });
          }}
          onSkillsChange={(skills) => {
            onCapabilitiesPatch({ skills });
          }}
        />
      </div>
      <div className={cn(category !== 'hooks' && 'hidden')}>
        <AgentHooksPane
          key={`hooks-${activeAgent?.id ?? 'new'}`}
          orgId={orgId}
          agentId={activeAgent?.id ?? ''}
          value={capabilities.hooks ?? []}
          permissions={permissions ?? undefined}
          mcpServers={capabilities.mcpServers ?? []}
          onChange={(hooks) => {
            onCapabilitiesPatch({ hooks });
          }}
        />
      </div>
      <div className={cn(category !== 'compaction' && 'hidden')}>
        <DraftCompaction
          key={`compaction-${activeAgent?.id ?? 'new'}`}
          agent={activeAgent}
          onChange={(compaction) => {
            onCapabilitiesPatch({ compaction });
          }}
        />
      </div>
      <Controller
        control={form.control}
        name="memoryPolicy"
        render={({ field }) => (
          <div className={cn(category !== 'memory' && 'hidden')}>
            <AgentMemoryPolicyPane
              value={field.value ?? null}
              onChange={(next) => field.onChange(next)}
              embeddingsAvailable={memoryStatus.data?.embeddingsAvailable ?? null}
              orgId={orgId}
              agentId={activeAgent?.id ?? null}
            />
          </div>
        )}
      />
      <Pane
        className={cn(category !== 'limits' && 'hidden')}
        label="Limits"
        description="Budget limits for a single run."
      >
        <AgentLimitsPane form={form} />
      </Pane>
      <Pane
        className={cn(category !== 'execution' && 'hidden')}
        label="Execution"
        description="Where this agent runs."
      >
        <AgentExecutionPane form={form} activeAgent={activeAgent} />
      </Pane>
      <AgentSubagentsSection
        category={category}
        orgId={orgId}
        activeAgent={activeAgent}
        showSubagents={showSubagents}
        enabledPlugins={capabilities.enabledPlugins ?? {}}
        onOpenSubagent={onOpenSubagent}
      />
      <AgentConnectorsSection category={category} orgId={orgId} activeAgent={activeAgent} />
      {category === 'graph' ? (
        <Pane
          sticky={false}
          className="min-h-0 flex-1"
          label="Graph"
          description="ReAct graph of this agent."
        >
          <AgentGraphPane
            value={graphDoc}
            onChange={(next) => {
              graphTouchedRef.current = true;
              graphDocRef.current = next;
              setGraphDoc(next);
            }}
          />
        </Pane>
      ) : null}
    </div>
  );
}

function AgentSubagentsSection({
  category,
  orgId,
  activeAgent,
  showSubagents,
  enabledPlugins,
  onOpenSubagent,
}: {
  category: AgentConfigCategory;
  orgId: string;
  activeAgent: Agent | null;
  showSubagents: boolean;
  enabledPlugins: Record<string, boolean>;
  onOpenSubagent: (agent: Agent) => void;
}) {
  if (category !== 'subagents') {
    return null;
  }
  if (!showSubagents) {
    return null;
  }
  if (!activeAgent || activeAgent.id === '') {
    return <UnsavedAgentHint text="Save the agent to add subagents." />;
  }
  return (
    <AgentSubagentsPane
      orgId={orgId}
      parentId={activeAgent.id}
      enabledPlugins={enabledPlugins}
      onConfigure={onOpenSubagent}
    />
  );
}

function AgentConnectorsSection({
  category,
  orgId,
  activeAgent,
}: {
  category: AgentConfigCategory;
  orgId: string;
  activeAgent: Agent | null;
}) {
  if (category !== 'connectors') {
    return null;
  }
  if (!activeAgent || activeAgent.id === '') {
    return <UnsavedAgentHint text="Save the agent to attach connectors." />;
  }
  return <AgentConnectorsPane orgId={orgId} agentId={activeAgent.id} />;
}

function UnsavedAgentHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
      {text}
    </p>
  );
}
