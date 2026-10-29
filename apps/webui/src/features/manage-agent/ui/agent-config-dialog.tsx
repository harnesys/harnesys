import type { AgentSourceLevel } from '@harnesys/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import { saveAgentAsPreset } from '@/features/preset-marketplace/model/save-agent-as-preset';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { type DialogComponentProps, dialog, patchOverlayOptions } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';
import type { AgentCapabilitiesDraft, AgentConfigResult } from '../model/agent-config';
import {
  type AgentFieldsInput,
  type AgentFieldsOutput,
  agentFieldsFrom,
  agentFieldsSchema,
  emptyAgentFields,
  toAgentDraft,
} from '../model/agent-fields';
import { defaultReactGraph, type StudioGraphDocument } from '../model/agent-graph-document';
import { sanitizeForModel } from '../model/agent-model-info';
import { deleteAgent } from '../model/delete-agent';
import { AgentConfigCategoryPanes } from './agent-config-category-panes';
import {
  deletedConfigResult,
  initialCapabilities,
  mergeCapabilitiesDraft,
  persistAgentConfigEdit,
  resolveFocusAgent,
  resolveReturnParent,
} from './agent-config-dialog-helpers';
import {
  type AgentConfigCategory,
  AgentConfigCategoryNav,
  filterAgentConfigCategories,
  GraphContentNavToggle,
  shouldResetAgentConfigCategory,
} from './agent-config-nav';
import { AgentDeleteConfirmDialog } from './agent-delete-confirm-dialog';

export type { AgentConfigCategory } from './agent-config-nav';
export { AGENT_CONFIG_CATEGORIES } from './agent-config-nav';

const GRAPH_DIALOG_CLASS =
  'flex min-h-0 h-[min(90vh,768px)] w-[min(90vw,1024px)] max-w-[min(90vw,1024px)] sm:max-w-[min(90vw,1024px)] overflow-hidden';
const DEFAULT_DIALOG_CLASS =
  'flex min-h-0 h-[min(78vh,48rem)] w-full max-w-3xl sm:max-w-3xl overflow-hidden';

export function openAgentConfigDialog(agent: Agent | null, orgId: string) {
  return dialog.open(AgentConfigDialog, {
    title: agent ? `Configure ${agent.name}` : 'New agent',
    className: DEFAULT_DIALOG_CLASS,
    testId: 'agent-config-dialog',
    data: { agent, orgId },
  });
}

export function AgentConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<
  AgentConfigResult,
  {
    agent: Agent | null;
    orgId: string;
  }
>) {
  const rootAgent = data?.agent ?? null;
  const orgId = data?.orgId ?? '';
  const queryClient = useQueryClient();
  const [focusAgentId, setFocusAgentId] = useState<string | null>(rootAgent?.id ?? null);
  const [returnParentId, setReturnParentId] = useState<string | null>(null);
  const [category, setCategory] = useState<AgentConfigCategory>('identity');
  const [navOpen, setNavOpen] = useState(true);
  const [graphDoc, setGraphDoc] = useState<StudioGraphDocument>(
    () => rootAgent?.graph ?? defaultReactGraph(),
  );
  const graphDocRef = useRef(graphDoc);
  graphDocRef.current = graphDoc;
  const graphTouchedRef = useRef(false);
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const [capabilities, setCapabilities] = useState<AgentCapabilitiesDraft>(() =>
    initialCapabilities(rootAgent),
  );
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  const [sharedSourceIds, setSharedSourceIds] = useState<string[]>(
    () => rootAgent?.sharedSourceIds ?? [],
  );
  const sharedSourceIdsRef = useRef(sharedSourceIds);
  sharedSourceIdsRef.current = sharedSourceIds;
  const [sourceLevels, setSourceLevels] = useState<Record<string, AgentSourceLevel>>(
    () => rootAgent?.sourceLevels ?? {},
  );
  const sourceLevelsRef = useRef(sourceLevels);
  sourceLevelsRef.current = sourceLevels;
  const form = useForm<AgentFieldsInput, unknown, AgentFieldsOutput>({
    resolver: zodResolver(agentFieldsSchema),
    defaultValues: rootAgent ? agentFieldsFrom(rootAgent) : emptyAgentFields(),
  });
  const nameValue = useWatch({ control: form.control, name: 'name' }) ?? '';
  const modelIdValue = useWatch({ control: form.control, name: 'modelId' });
  const storeFocus = useAgentStore((state) =>
    focusAgentId ? (state.byId(focusAgentId) ?? null) : null,
  );
  const storeReturnParent = useAgentStore((state) =>
    returnParentId ? (state.byId(returnParentId) ?? null) : null,
  );
  const isPresetDraft = rootAgent !== null && rootAgent.id === '';
  const focusMatches = Boolean(focusAgentId && focusAgentId === rootAgent?.id);
  const activeAgent = resolveFocusAgent({
    storeFocus: storeFocus ?? null,
    rootAgent,
    focusMatches,
    isPresetDraft,
  });
  const returnParent = resolveReturnParent({
    storeReturnParent: storeReturnParent ?? null,
    rootAgent,
    returnParentId,
  });
  const isDelegate = Boolean(activeAgent?.parentId);
  const showSubagents = !isDelegate;
  const navCategories = filterAgentConfigCategories({
    isDelegate,
    showSubagents,
  });
  useEffect(() => {
    patchOverlayOptions({
      className: category === 'graph' ? GRAPH_DIALOG_CLASS : DEFAULT_DIALOG_CLASS,
    });
    return () => {
      patchOverlayOptions({ className: DEFAULT_DIALOG_CLASS });
    };
  }, [category]);
  useEffect(() => {
    if (shouldResetAgentConfigCategory(category, { showSubagents })) {
      setCategory('identity');
    }
  }, [category, showSubagents]);
  useEffect(() => {
    patchOverlayOptions({
      title: activeAgent ? `Configure ${activeAgent.name}` : 'New agent',
    });
  }, [activeAgent]);
  function selectCategory(next: AgentConfigCategory) {
    if (next === 'graph') {
      graphTouchedRef.current = true;
      setCategory(next);
      return;
    }
    setNavOpen(true);
    setCategory(next);
  }
  function loadAgentEditors(target: Agent) {
    form.reset(agentFieldsFrom(target));
    setCapabilities(initialCapabilities(target));
    setSharedSourceIds(target.sharedSourceIds ?? []);
    setSourceLevels(target.sourceLevels ?? {});
    const nextGraph = target.graph ?? defaultReactGraph();
    graphTouchedRef.current = false;
    graphDocRef.current = nextGraph;
    setGraphDoc(nextGraph);
  }
  function patchCapabilities(patch: Partial<AgentCapabilitiesDraft>) {
    setCapabilities((prev) => mergeCapabilitiesDraft(prev, patch));
  }
  function buildResult(values: AgentFieldsOutput): AgentConfigResult {
    const draft = toAgentDraft(values);
    const sanitized = sanitizeForModel(draft.modelId, draft.effort, draft.generation, providers);
    const includeGraph = graphTouchedRef.current || rootAgent?.id === '';
    const graph = includeGraph ? graphDocRef.current : undefined;
    return {
      fields: {
        ...draft,
        ...sanitized,
        sharedSourceIds: sharedSourceIdsRef.current,
        sourceLevels: sourceLevelsRef.current,
        ...(graph !== undefined ? { graph } : {}),
      },
      capabilities: capabilitiesRef.current,
      ...(graph !== undefined ? { graph } : {}),
    };
  }
  function persistCurrent(): Promise<boolean> {
    if (!activeAgent || !orgId) {
      return Promise.resolve(false);
    }
    const agentId = activeAgent.id;
    return new Promise((resolve) => {
      void form.handleSubmit(
        async (values) => {
          resolve(
            await persistAgentConfigEdit({
              orgId,
              agentId,
              result: buildResult(values),
              queryClient,
            }),
          );
        },
        () => resolve(false),
      )();
    });
  }
  async function openSubagent(delegate: Agent) {
    const parentId = activeAgent?.id ?? rootAgent?.id ?? null;
    if (!parentId) {
      return;
    }
    const saved = await persistCurrent();
    if (!saved) {
      return;
    }
    setReturnParentId(parentId);
    setFocusAgentId(delegate.id);
    loadAgentEditors(delegate);
    setCategory('identity');
  }
  async function backFromSubagent() {
    const parentId = returnParentId;
    if (!parentId) {
      return;
    }
    const saved = await persistCurrent();
    if (!saved) {
      return;
    }
    const parent = useAgentStore.getState().byId(parentId);
    if (!parent) {
      toast.add({ title: 'Parent agent is gone' });
      return;
    }
    setReturnParentId(null);
    setFocusAgentId(parentId);
    loadAgentEditors(parent);
    setCategory('subagents');
  }
  const canDelete = Boolean(
    rootAgent && rootAgent.id !== '' && activeAgent && activeAgent.id !== '',
  );
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteResolver = useRef<((confirmed: boolean) => void) | null>(null);
  function confirmDelete(): Promise<boolean> {
    return new Promise((resolve) => {
      deleteResolver.current = resolve;
      setPendingDelete(true);
    });
  }
  function settleDelete(confirmed: boolean): void {
    deleteResolver.current?.(confirmed);
    deleteResolver.current = null;
    setPendingDelete(false);
  }
  async function deleteFocused() {
    const confirmed = await confirmDelete();
    if (!confirmed || !activeAgent) {
      return;
    }
    await deleteAgent(orgId, activeAgent.id);
    onResolve?.(deletedConfigResult(activeAgent));
  }
  const categoryNavProps = {
    categories: navCategories,
    category,
    onSelect: selectCategory,
    backLabel: returnParentId
      ? `Back${returnParent?.name ? ` to ${returnParent.name}` : ''}`
      : null,
    onBack: returnParentId
      ? () => {
          void backFromSubagent();
        }
      : undefined,
  };
  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        if (!returnParentId) {
          onResolve?.(buildResult(values));
          return;
        }
        if (!activeAgent) {
          return;
        }
        void persistAgentConfigEdit({
          orgId,
          agentId: activeAgent.id,
          result: buildResult(values),
          queryClient,
          successTitle: 'Subagent saved',
        });
      })}
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        {category !== 'graph' || navOpen ? <AgentConfigCategoryNav {...categoryNavProps} /> : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-3">
          {category === 'graph' ? (
            <GraphContentNavToggle open={navOpen} onToggle={() => setNavOpen((open) => !open)} />
          ) : null}
          <AgentConfigCategoryPanes
            category={category}
            form={form}
            orgId={orgId}
            activeAgent={activeAgent}
            showSubagents={showSubagents}
            isDelegate={isDelegate}
            graphDoc={graphDoc}
            graphDocRef={graphDocRef}
            graphTouchedRef={graphTouchedRef}
            setGraphDoc={setGraphDoc}
            capabilities={capabilities}
            onCapabilitiesPatch={patchCapabilities}
            sharedSourceIds={sharedSourceIds}
            onSharedSourceIdsChange={setSharedSourceIds}
            sourceLevels={sourceLevels}
            onSourceLevelsChange={setSourceLevels}
            onOpenSubagent={(delegate) => {
              void openSubagent(delegate);
            }}
          />
        </div>
      </div>
      <DialogFooter>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="agent-delete"
            onClick={() => {
              void deleteFocused();
            }}
          >
            Delete
          </Button>
        ) : null}
        {activeAgent && activeAgent.id !== '' ? (
          <Button
            type="button"
            variant="outline"
            data-testid="agent-save-as-preset"
            onClick={() => {
              void saveAgentAsPreset(activeAgent, orgId);
            }}
          >
            Save as preset
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={nameValue.trim().length === 0 || !modelIdValue}
          title={!modelIdValue ? 'Pick a model before saving' : undefined}
        >
          Save
        </Button>
      </DialogFooter>
      <AgentDeleteConfirmDialog
        open={pendingDelete}
        agentName={activeAgent?.name}
        onSettle={settleDelete}
      />
    </form>
  );
}
