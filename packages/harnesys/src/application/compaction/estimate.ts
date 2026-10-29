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
