import type { Agent } from '@/entities/agent';
import { openSavePresetDialog } from '../ui/save-preset-dialog';
import { agentPresetBodyFromAgent } from './preset-mappers';

export async function saveAgentAsPreset(agent: Agent, orgId: string): Promise<boolean> {
  const saved = await openSavePresetDialog({
    orgId,
    kind: 'agent',
    body: agentPresetBodyFromAgent(agent),
    name: agent.name,
  });
  return saved !== null;
}
