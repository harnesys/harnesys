import type { ProviderPublic, RequestPlan, SessionEvent } from '@harnesys/studio-shared';
import type { MessageUsage } from '@/entities/session';
import { findModel } from './model-input';

export function generationUsages(events: SessionEvent[]): MessageUsage[] {
  const out: MessageUsage[] = [];
  for (const event of events) {
    if (event.type !== 'model.usage' || event.origin === 'memory') {
      continue;
    }
    const usage = event.usage;
    out.push({
      model: usage.model,
      promptTokens: usage.promptTokens,
      generatedTokens: usage.generatedTokens,
      contextTokens: 0,
      durationMs: usage.durationMs ?? 0,
      tools: [],
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      ...(event.costUsd !== undefined ? { costUsd: event.costUsd } : {}),
      ...(event.pricingSource !== undefined ? { pricingSource: event.pricingSource } : {}),
    });
  }
  return out;
}
export function turnGenerationUsages(events: SessionEvent[]): MessageUsage[] {
  let lastUser = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type === 'user') {
      lastUser = i;
    }
  }
  return generationUsages(lastUser < 0 ? events : events.slice(lastUser + 1));
}
export interface ModelToolStats {
  tools: number;
  deferredPending: number;
  systemChars: number;
  plan?: RequestPlan;
}
export function lastModelStats(events: SessionEvent[]): ModelToolStats | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === 'model.stats') {
      return {
        tools: event.tools,
        deferredPending: event.deferredPending,
        systemChars: event.systemChars,
        ...(event.plan ? { plan: event.plan } : {}),
      };
    }
  }
  return null;
}
export function modelContextWindow(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
  fallback?: number,
): number {
  const record = findModel(modelId, providers);
  const window =
    record?.contextWindow ??
    record?.host?.context_length ??
    record?.host?.top_provider?.context_length ??
    record?.context_length ??
    record?.top_provider?.context_length;
  if (window && window > 0) {
    return window;
  }
  return fallback && fallback > 0 ? fallback : 0;
}
export function fillUsageWindow(usage: MessageUsage | null, window: number): MessageUsage | null {
  if (!usage) {
    return null;
  }
  if (usage.contextTokens > 0 || window <= 0) {
    return usage;
  }
  return { ...usage, contextTokens: window };
}
