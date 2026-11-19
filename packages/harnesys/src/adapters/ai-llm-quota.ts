import { CHARS_PER_TOKEN_ESTIMATE } from '../constants.ts';
import type { AgentGenerationSettings } from '../domain/agent-definition.ts';
import type { ModelQuotaPort, QuotaBucket } from '../ports/model-quota.ts';
import type { ModelBinding, ModelRateLimits, ResolvedModel } from '../ports/models.ts';
import type { StreamChunk } from './ai-llm-chunks.ts';
import { abortableSleep } from './ai-llm-retry.ts';

export function usageTokensOf(usage: unknown): number {
  if (!usage || typeof usage !== 'object') {
    return 0;
  }
  const u = usage as Record<string, unknown>;
  if (typeof u.totalTokens === 'number' && Number.isFinite(u.totalTokens)) {
    return u.totalTokens;
  }
  const input = typeof u.inputTokens === 'number' ? u.inputTokens : 0;
  const output = typeof u.outputTokens === 'number' ? u.outputTokens : 0;
  return input + output;
}
export function estimateRequestTokens(prompt: string, messages: unknown[]): number {
  const chars = prompt.length + JSON.stringify(messages ?? []).length;
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}
export function effectiveRateLimits(
  generation: AgentGenerationSettings | undefined,
  model: ResolvedModel,
): ModelRateLimits | undefined {
  return generation?.modelLimits ?? model.rateLimits;
}
const MS_PER_SECOND = 1_000;
function throttleChunk(reason: QuotaBucket, waitMs: number): StreamChunk {
  const secs = Math.max(1, Math.round(waitMs / MS_PER_SECOND));
  return {
    type: 'throttle',
    reason,
    delayMs: waitMs,
    message: `Model quota reached (${reason}): waiting ${secs}s until the window resets.`,
  };
}
export interface QuotaLease {
  reservation?: string;
  aborted: boolean;
  settle(actualTokens: number | undefined): void;
}
const idleLease: QuotaLease = { aborted: false, settle() {} };
const abortedLease: QuotaLease = { aborted: true, settle() {} };
export async function* acquireLease(input: {
  quota?: ModelQuotaPort;
  binding: ModelBinding;
  generation?: AgentGenerationSettings;
  prompt: string;
  messages: unknown[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk, QuotaLease, unknown> {
  const { quota, binding, generation, prompt, messages, signal } = input;
  if (!quota) {
    return idleLease;
  }
  const limits = effectiveRateLimits(generation, binding.model);
  if (!limits) {
    return idleLease;
  }
  const key = `${binding.name}:${binding.model.name}`;
  const estTokens = estimateRequestTokens(prompt, messages);
  for (;;) {
    if (signal?.aborted) {
      return abortedLease;
    }
    const admission = quota.admit(key, limits, estTokens);
    if (admission.granted && admission.reservation !== undefined) {
      const reservation = admission.reservation;
      return {
        reservation,
        aborted: false,
        settle: (actualTokens) => quota.settle(key, reservation, actualTokens),
      };
    }
    yield throttleChunk(admission.reason ?? 'rpm', admission.waitMs ?? 0);
    await abortableSleep(admission.waitMs ?? 0, signal);
  }
}
