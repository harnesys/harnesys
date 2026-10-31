import { VISION_IMAGE_TYPES } from '../../constants.ts';
import { parseFileToolResult } from '../tool-message.ts';
import { estimateMessageTokens } from './estimate.ts';

export const MICROCOMPACT_KEEP_ROUNDS = 5;
export const MICROCOMPACT_MIN_GAIN_TOKENS = 256;
export const MICROCOMPACT_CLEARED_MARKER = '[Old tool result content cleared]';
const CLEARED_TEXT = `${MICROCOMPACT_CLEARED_MARKER} Re-run the tool if you need the content again.`;
interface ToolRecord {
  message: Record<string, unknown>;
  content: string;
  isError?: unknown;
  name?: unknown;
}
function toolRecordOf(message: unknown): ToolRecord | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  const m = message as Record<string, unknown>;
  if (m.role !== 'tool' || typeof m.content !== 'string') {
    return undefined;
  }
  return { message: m, content: m.content, isError: m.isError, name: m.name };
}
function isMediaPayload(record: ToolRecord): boolean {
  const payload = parseFileToolResult(String(record.name ?? ''), record.content);
  return payload !== undefined && VISION_IMAGE_TYPES.includes(payload.mediaType);
}
function isAssistantRound(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const m = message as Record<string, unknown>;
  return m.role === 'assistant' && m.kind !== 'compaction';
}
export interface MicrocompactOptions {
  keepRounds?: number;
  /** Experimental: uncleared assistant rounds to accumulate before a pass fires (default: keepRounds). */
  stepRounds?: number;
  minGainTokens?: number;
}
function intOrDefault(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}
/**
 * Experimental: clear tool-result bodies behind a stepped window.
 *
 * A pass fires only when at least `stepRounds` assistant rounds with intact
 * tool results have accumulated behind the kept tail, then clears the whole
 * batch in one pass. Between passes the history bytes stay stable, which
 * keeps provider prompt caches warm; a per-step sliding boundary would
 * rewrite history on every call and break the cache prefix each time.
 */
export function microcompactToolResults(
  messages: unknown[],
  options: MicrocompactOptions = {},
): boolean {
  const keepRounds = intOrDefault(options.keepRounds, 1, MICROCOMPACT_KEEP_ROUNDS);
  const stepRounds = intOrDefault(options.stepRounds, 1, keepRounds);
  const minGainTokens = intOrDefault(options.minGainTokens, 0, MICROCOMPACT_MIN_GAIN_TOKENS);
  const rounds: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isAssistantRound(messages[i])) {
      rounds.push(i);
    }
  }
  const boundaryIndex = rounds.length - keepRounds;
  const boundary = boundaryIndex > 0 ? rounds[boundaryIndex] : undefined;
  if (boundary === undefined) {
    return false;
  }
  const targets: ToolRecord[] = [];
  const pendingRounds = new Set<number>();
  let owner = -1;
  for (let i = 0; i < boundary; i++) {
    if (isAssistantRound(messages[i])) {
      owner = i;
    }
    const record = toolRecordOf(messages[i]);
    if (!record || record.isError === true || isMediaPayload(record)) {
      continue;
    }
    if (record.content === CLEARED_TEXT) {
      continue;
    }
    targets.push(record);
    if (owner >= 0) {
      pendingRounds.add(owner);
    }
  }
  if (targets.length === 0 || pendingRounds.size < stepRounds) {
    return false;
  }
  const gain = targets.reduce((sum, r) => sum + estimateMessageTokens(r), 0);
  if (gain < minGainTokens) {
    return false;
  }
  for (const record of targets) {
    record.message.content = CLEARED_TEXT;
  }
  return true;
}
