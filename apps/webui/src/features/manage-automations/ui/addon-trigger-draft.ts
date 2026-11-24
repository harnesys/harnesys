import type { FieldValue, TriggerInstanceView, WorkspaceRef } from '@harnesys/contracts';
import { WorkspaceRefSchema } from '@harnesys/contracts';
import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import type { Agent } from '@/entities/agent';
import type { ClientAutomation } from '@/entities/automation';
import type { AddonTriggerDescriptor } from '@/features/manage-addons/lib/view-sections';
import { initialFieldValues } from '@/shared/descriptor-forms';
import { resolveL10n } from '@/shared/lib/l10n';
import type { AddonTriggerDraft } from '../model/addon-trigger';

export interface TriggerTargetDraft {
  threadId?: string;
  agentId?: string;
  modeId?: string;
  workspace?: WorkspaceRef;
}

export function targetOf(target: unknown): TriggerTargetDraft {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return {};
  }
  const record = target as Record<string, unknown>;
  const workspace = WorkspaceRefSchema.safeParse(record.workspace);
  return {
    ...(typeof record.threadId === 'string' ? { threadId: record.threadId } : {}),
    ...(typeof record.agentId === 'string' ? { agentId: record.agentId } : {}),
    ...(typeof record.modeId === 'string' ? { modeId: record.modeId } : {}),
    ...(workspace.success ? { workspace: workspace.data } : {}),
  };
}

export function initialDraft(input: {
  descriptor: AddonTriggerDescriptor;
  automation: ClientAutomation | null;
  instance: TriggerInstanceView | null;
  agents: Agent[];
  target: TriggerTargetDraft;
}): AddonTriggerDraft {
  const firstAgent =
    input.agents.find((agent) => agent.id === input.target.agentId) ?? input.agents[0];
  return {
    label: input.automation?.label ?? resolveL10n(input.descriptor.title, 'en'),
    agentId: firstAgent?.id ?? '',
    threadId: input.target.threadId ?? '',
    modeId: input.target.modeId ?? firstAgent?.defaultModeId ?? DEFAULT_MODE_ID,
    workspace: input.target.workspace ?? null,
    instructions: input.instance?.instructions ?? '',
    enabled: input.instance?.status !== 'paused',
    config: initialFieldValues(
      input.descriptor.configFields ?? [],
      (input.instance?.config ?? {}) as Record<string, FieldValue>,
    ),
  };
}
