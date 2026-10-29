import type { AgentHookEvent } from '@harnesys/contracts';
import { HOOK_EVENT_CATALOG, type HookEventPhase, hookCatalogEntry } from 'harnesys/domain';

export { HOOK_EVENT_CATALOG };

export const HOOK_PHASE_LABELS: Record<HookEventPhase, string> = {
  session: 'Session',
  prompt: 'Prompt',
  tool: 'Tools',
  model: 'Model',
  agent: 'Subagents',
  compact: 'Compaction',
};

export function hookEventDescription(event: AgentHookEvent): string {
  return hookCatalogEntry(event).description;
}
