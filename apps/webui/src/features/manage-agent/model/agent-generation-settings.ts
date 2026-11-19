import type { AgentGenerationSettings, ModelRateLimits } from '@harnesys/studio-shared';
import { contextSettingsOf } from './agent-context-settings';
import type { AgentFieldsOutput } from './agent-fields';

type ReasoningSettings = Pick<AgentGenerationSettings, 'stripReasoning' | 'reasoningKeepRounds'>;

export function generationSettingsOf(values: AgentFieldsOutput): AgentGenerationSettings {
  const context = contextSettingsOf(values);
  const modelLimits = modelLimitsOf(values);
  return {
    temperature: values.temperature,
    topP: values.topP,
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
    ...(modelLimits ? { modelLimits } : {}),
    ...(context ? { context } : {}),
  };
}

function modelLimitsOf(values: AgentFieldsOutput): ModelRateLimits | undefined {
  const limits: ModelRateLimits = {
    rpm: values.modelLimitRpm,
    rpd: values.modelLimitRpd,
    tpm: values.modelLimitTpm,
    tpd: values.modelLimitTpd,
  };
  return Object.values(limits).some((value) => value !== undefined) ? limits : undefined;
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
