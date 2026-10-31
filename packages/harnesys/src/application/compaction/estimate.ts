import { type GateModelInfo, mediaDeliveryGates } from '../../adapters/ai-llm-provider.ts';
import { CHARS_PER_TOKEN_ESTIMATE, IMAGE_TOKEN_ESTIMATE } from '../../constants.ts';
import { type HistoryMessage, selectMaterializable } from '../tool-message.ts';
export interface TokenEstimate {
  messages: number;
  tools: number;
  total: number;
}
function textLen(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}
function jsonLen(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}
export function estimateMessageTokens(message: unknown): number {
  if (!message || typeof message !== 'object') {
    return 0;
  }
  const m = message as Record<string, unknown>;
  const chars =
    textLen(m.content) +
    textLen(m.reasoning) +
    jsonLen(m.toolCalls) +
    jsonLen(m.attachments) +
    jsonLen(m.sources) +
    jsonLen(m.files);
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}
export interface EstimateMediaOptions {
  model?: GateModelInfo;
}
export interface UsageAnchor {
  index: number;
  tokens: number;
}
export function usageAnchorOf(messages: readonly unknown[]): UsageAnchor | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (!m || typeof m !== 'object' || m.role !== 'assistant' || m.kind === 'compaction') {
      continue;
    }
    const usage = m.usage as Record<string, unknown> | null | undefined;
    if (!usage || typeof usage !== 'object') {
      continue;
    }
    const total =
      typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)
        ? usage.totalTokens
        : undefined;
    const io =
      (typeof usage.inputTokens === 'number' ? usage.inputTokens : 0) +
      (typeof usage.outputTokens === 'number' ? usage.outputTokens : 0);
    const tokens = total ?? (io > 0 ? io : undefined);
    if (tokens === undefined) {
      continue;
    }
    return { index: i, tokens };
  }
  return undefined;
}
export function estimateTokensAnchored(
  messages: readonly unknown[],
  toolsJson?: string,
  media?: EstimateMediaOptions,
): TokenEstimate {
  const anchor = usageAnchorOf(messages);
  if (!anchor || anchor.index >= messages.length - 1) {
    return estimateTokens(messages, toolsJson, media);
  }
  const suffix = messages.slice(anchor.index + 1);
  const suffixMessages = estimateTokens(suffix).messages;
  const images = imagesOf(suffix, media);
  const tools = toolsJson ? Math.ceil(toolsJson.length / CHARS_PER_TOKEN_ESTIMATE) : 0;
  const messagesTotal = anchor.tokens + suffixMessages;
  return {
    messages: messagesTotal,
    tools,
    total: messagesTotal + images * IMAGE_TOKEN_ESTIMATE + tools,
  };
}
function imagesOf(messages: readonly unknown[], media?: EstimateMediaOptions): number {
  if (media?.model === undefined || !mediaDeliveryGates(media.model)) {
    return 0;
  }
  return selectMaterializable(messages as HistoryMessage[]).selected.length;
}
export function estimateTokens(
  messages: readonly unknown[],
  toolsJson?: string,
  media?: EstimateMediaOptions,
): TokenEstimate {
  const msgs = messages.reduce<number>((sum, m) => sum + estimateMessageTokens(m), 0);
  let images = 0;
  if (media?.model !== undefined && mediaDeliveryGates(media.model)) {
    images = selectMaterializable(messages as HistoryMessage[]).selected.length;
  }
  const tools = toolsJson ? Math.ceil(toolsJson.length / CHARS_PER_TOKEN_ESTIMATE) : 0;
  return { messages: msgs, tools, total: msgs + images * IMAGE_TOKEN_ESTIMATE + tools };
}
