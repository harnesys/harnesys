import { type GateModelInfo, mediaDeliveryGates } from '../../adapters/ai-llm-provider.ts';
import {
  CHARS_PER_TOKEN_CJK,
  CHARS_PER_TOKEN_CYRILLIC,
  CHARS_PER_TOKEN_ESTIMATE,
  CHARS_PER_TOKEN_LATIN,
  IMAGE_TOKEN_ESTIMATE,
} from '../../constants.ts';
import { type HistoryMessage, selectMaterializable } from '../tool-message.ts';
export interface TokenEstimate {
  messages: number;
  tools: number;
  total: number;
}
type ScriptClass = 'latin' | 'cyrillic' | 'cjk';
function scriptClassOf(code: number): ScriptClass {
  if (code >= 0x0400 && code <= 0x04ff) {
    return 'cyrillic';
  }
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) {
    return 'cjk';
  }
  return 'latin';
}
function charsPerTokenOf(script: ScriptClass): number {
  if (script === 'cyrillic') {
    return CHARS_PER_TOKEN_CYRILLIC;
  }
  if (script === 'cjk') {
    return CHARS_PER_TOKEN_CJK;
  }
  return CHARS_PER_TOKEN_LATIN;
}
export function textTokensOf(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  let tokens = 0;
  let index = 0;
  while (index < text.length) {
    const script = scriptClassOf(text.charCodeAt(index));
    const start = index;
    index++;
    while (index < text.length && scriptClassOf(text.charCodeAt(index)) === script) {
      index++;
    }
    tokens += (index - start) / charsPerTokenOf(script);
  }
  return tokens;
}
function textCharsOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
  const jsonChars =
    jsonLen(m.toolCalls) + jsonLen(m.attachments) + jsonLen(m.sources) + jsonLen(m.files);
  const textTokens = textTokensOf(textCharsOf(m.content)) + textTokensOf(textCharsOf(m.reasoning));
  return Math.ceil(textTokens + jsonChars / CHARS_PER_TOKEN_ESTIMATE);
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
    if (!m || typeof m !== 'object') {
      continue;
    }
    if (m.kind === 'compaction') {
      break;
    }
    if (m.role !== 'assistant') {
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
