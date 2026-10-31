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
export function microcompactToolResults(messages: unknown[]): boolean {
  const rounds: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (m && typeof m === 'object' && m.role === 'assistant' && m.kind !== 'compaction') {
      rounds.push(i);
    }
  }
  const boundaryIndex = rounds.length - MICROCOMPACT_KEEP_ROUNDS;
  const boundary = boundaryIndex >= 0 ? rounds[boundaryIndex] : undefined;
  if (boundary === undefined || boundary <= 0) {
    return false;
  }
  const targets: ToolRecord[] = [];
  for (let i = 0; i < boundary; i++) {
    const record = toolRecordOf(messages[i]);
    if (!record || record.isError === true || isMediaPayload(record)) {
      continue;
    }
    if (record.content === CLEARED_TEXT) {
      continue;
    }
    targets.push(record);
  }
  if (targets.length === 0) {
    return false;
  }
  const gain = targets.reduce((sum, r) => sum + estimateMessageTokens(r), 0);
  if (gain < MICROCOMPACT_MIN_GAIN_TOKENS) {
    return false;
  }
  for (const record of targets) {
    record.message.content = CLEARED_TEXT;
  }
  return true;
}
