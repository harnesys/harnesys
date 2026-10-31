import type { AgentGenerationSettings } from '@harnesys/studio-shared';
import { contextSettingsOf } from './agent-context-settings';
import type { AgentFieldsOutput } from './agent-fields';

type ReasoningSettings = Pick<AgentGenerationSettings, 'stripReasoning' | 'reasoningKeepRounds'>;

export function generationSettingsOf(values: AgentFieldsOutput): AgentGenerationSettings {
  const context = contextSettingsOf(values);
  return {
    temperature: values.temperature,
    topP: values.topP,
    topK: values.topK,
    frequencyPenalty: values.frequencyPenalty,
    presencePenalty: values.presencePenalty,
    seed: values.seed,
    maxTokens: values.maxTokens,
    contextWindowTokens: values.contextWindowTokens,
    ...reasoningSettingsOf(values),
    ...(values.streamIdleTimeoutMs !== undefined
      ? { streamIdleTimeoutMs: values.streamIdleTimeoutMs }
      : {}),
    ...(values.providerRetryAttempts !== undefined
      ? { providerRetryAttempts: values.providerRetryAttempts }
      : {}),
    ...(context ? { context } : {}),
  };
}

function reasoningSettingsOf(values: AgentFieldsOutput): ReasoningSettings {
  if (values.reasoningMode === 'strip') {
    return {};
  }
  if (values.reasoningMode === 'keep') {
    return { stripReasoning: false };
  }
  return {
    stripReasoning: false,
    ...(values.reasoningKeepRounds !== undefined
      ? { reasoningKeepRounds: values.reasoningKeepRounds }
      : {}),
  };
}
