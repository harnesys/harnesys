import type { AgentContextSettings } from '@harnesys/studio-shared';
import type { AgentFieldsOutput } from './agent-fields';

export function contextSettingsOf(
  values: Pick<
    AgentFieldsOutput,
    'ctxUsageAnchor' | 'ctxLengthCutContinuations' | 'ctxSpawnHeadChars' | 'ctxSpawnTailChars'
  >,
): AgentContextSettings | undefined {
  const context: AgentContextSettings = {};
  if (!values.ctxUsageAnchor) {
    context.usageAnchor = false;
  }
  if (values.ctxLengthCutContinuations !== undefined) {
    context.lengthCutContinuations = values.ctxLengthCutContinuations;
  }
  if (values.ctxSpawnHeadChars !== undefined) {
    context.spawnResultHeadChars = values.ctxSpawnHeadChars;
  }
  if (values.ctxSpawnTailChars !== undefined) {
    context.spawnResultTailChars = values.ctxSpawnTailChars;
  }
  return Object.keys(context).length > 0 ? context : undefined;
}
