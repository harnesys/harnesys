import type { AgentPresetRecord } from '@/shared/api/agents';
import { toast } from '@/shared/ui/toast';
import { openAgentConfigDialog } from './agent-dialogs';
import {
  agentDraftFromPreset,
  type CreateAgentFromPresetResult,
  createAgentFromPreset,
} from './create-agent-from-preset';
import { updateAgent, updateAgentCapabilities } from './update-agent';

export async function createAgentFromPresetFlow(
  orgId: string,
  presetId: string,
  record: AgentPresetRecord,
): Promise<CreateAgentFromPresetResult | null> {
  const draft = agentDraftFromPreset(record);
  const result = await openAgentConfigDialog(draft, orgId);
  if (!result) {
    return null;
  }
  if (!result.fields.modelId) {
    toast.add({ title: 'Pick a model before saving' });
    return null;
  }
  try {
    return await createFromPreset(orgId, presetId, result);
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : 'Could not create agent',
    });
    return null;
  }
}

async function createFromPreset(
  orgId: string,
  presetId: string,
  result: Awaited<ReturnType<typeof openAgentConfigDialog>>,
) {
  if (!result?.fields.modelId) {
    return null;
  }
  const created = await createAgentFromPreset(orgId, presetId, {
    name: result.fields.name,
    modelId: result.fields.modelId,
  });
  if (!created) {
    return null;
  }
  const instructions = result.fields.instructions.trim() || created.agent.instructions;
  await updateAgent(orgId, created.agent.id, {
    ...result.fields,
    instructions,
  });
  await updateAgentCapabilities(orgId, created.agent.id, {
    ...result.capabilities,
    capabilities:
      Object.keys(result.capabilities.capabilities ?? {}).length > 0
        ? result.capabilities.capabilities
        : created.agent.capabilities,
  });
  return created;
}
