import { type AgentMode, DEFAULT_MODE, DEFAULT_MODE_ID } from '@harnesys/studio-shared';
export type ComposerMode = string;
export interface ComposerModeItem {
  value: string;
  label: string;
  detail: string;
}
export function composerModeItems(modes: AgentMode[]): ComposerModeItem[] {
  return [
    { value: DEFAULT_MODE_ID, label: DEFAULT_MODE.name, detail: 'Agent permission base' },
    ...modes.map((mode) => ({
      value: mode.id,
      label: mode.name,
      detail: mode.description ?? '',
    })),
  ];
}
export function knownMode(modes: AgentMode[], id: string | null | undefined): boolean {
  return typeof id === 'string' && (id === DEFAULT_MODE_ID || modes.some((mode) => mode.id === id));
}

interface ResolveComposerModeArgs {
  scheduleMode: string | null;
  threadRunMode: string | undefined;
  agentDefaultModeId: string | null | undefined;
  agentModes: AgentMode[];
}

export function resolveComposerMode({
  scheduleMode,
  threadRunMode,
  agentDefaultModeId,
  agentModes,
}: ResolveComposerModeArgs): ComposerMode {
  if (scheduleMode && knownMode(agentModes, scheduleMode)) {
    return scheduleMode;
  }
  if (threadRunMode && knownMode(agentModes, threadRunMode)) {
    return threadRunMode;
  }
  if (agentDefaultModeId && knownMode(agentModes, agentDefaultModeId)) {
    return agentDefaultModeId;
  }
  return DEFAULT_MODE_ID;
}
