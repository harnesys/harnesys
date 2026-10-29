export interface ToolMessage {
  role: 'tool';
  toolCallId: string;
  name: string;
  content: string;
}

import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_MATERIALIZED_AGE_USER_TURNS,
  MAX_MATERIALIZED_BYTES_TOTAL,
  MAX_MATERIALIZED_IMAGES,
  MAX_STUB_GROUPS,
  VISION_IMAGE_TYPES,
} from '../constants.ts';
import type { AttachmentKind } from '../domain/attachment.ts';

const ATTACHMENT_KINDS = ['image', 'audio', 'video', 'file'] as const;
export const SYNTHETIC_TOOL_RESULT_ABANDONED =
  '{"ok":false,"error":"run closed before user decision; the call was never executed and its effect did not happen"}';
export const SYNTHETIC_TOOL_RESULT_ENDED = 'run ended before tool execution; no result recorded';
export function serializeToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
export interface UnansweredToolCall {
  toolCallId: string;
  name: string;
}
export function collectUnansweredToolCalls(messages: unknown[]): UnansweredToolCall[] {
  const asked: UnansweredToolCall[] = [];
  const answered = new Set<string>();
  for (const item of messages) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (rec.role === 'assistant') {
      const calls = rec.toolCalls;
      if (Array.isArray(calls)) {
        for (const tc of calls) {
          if (!tc || typeof tc !== 'object') {
            continue;
          }
          const id = String((tc as Record<string, unknown>).id ?? '');
          if (id && !answered.has(id)) {
            asked.push({
              toolCallId: id,
              name: String((tc as Record<string, unknown>).name ?? 'tool'),
            });
          }
        }
      }
      continue;
    }
    if (rec.role === 'tool') {
      const id = String(rec.toolCallId ?? rec.id ?? '');
      if (id) {
        answered.add(id);
      }
    }
  }
  return asked.filter((c) => !answered.has(c.toolCallId));
}
export function buildToolMessageRaw(
  toolCallId: string,
  name: string,
  content: string,
): ToolMessage {
  return { role: 'tool', toolCallId, name, content };
}
export interface HistoryMessage {
  role: string;
  content?: unknown;
  toolCallId?: string;
  name?: string;
  toolCalls?: { id: string; name?: string; args?: unknown }[];
}
export interface FileToolPayload {
  relPath: string;
  mediaType: string;
  kind: AttachmentKind;
  attachmentId?: string;
  name?: string;
}
export type FileToolResult = { ok: true } & FileToolPayload;
export type MaterializationReason =
  | 'file_missing'
  | 'policy_denied'
  | 'too_large'
  | 'read_error'
  | 'not_image';
export type MediaPart =
  | { type: 'file'; mediaType: string; data: string }
  | { type: 'text'; text: string };
export interface MediaInsert {
  afterToolCallId: string;
  message: HistoryMessage;
}
export interface ToolMedia {
  inserts: MediaInsert[];
  stats: { materialized: number; failed: number };
}
export const FILE_TOOL_SOURCE_NAMES: ReadonlySet<string> = new Set([
  'file_read',
  'file_read_image',
  'image_generate',
  'gmail_download_attachment',
]);
export function parseFileToolResult(toolName: string, content: string): FileToolResult | undefined {
  if (!FILE_TOOL_SOURCE_NAMES.has(toolName) || !content.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.ok !== true) {
      return undefined;
    }
    const relPath = parsed.relPath;
    const mediaType = parsed.mediaType;
    const kind = parsed.kind;
    if (typeof relPath !== 'string' || typeof mediaType !== 'string') {
      return undefined;
    }
    if (typeof kind !== 'string' || !ATTACHMENT_KINDS.includes(kind as AttachmentKind)) {
      return undefined;
    }
    const out: FileToolResult = { ok: true, relPath, mediaType, kind: kind as AttachmentKind };
    if (typeof parsed.attachmentId === 'string') {
      out.attachmentId = parsed.attachmentId;
    }
    if (typeof parsed.name === 'string') {
      out.name = parsed.name;
    }
    return out;
  } catch {
    return undefined;
  }
}
export function sniffImageType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}
export function sniffImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  if (bytes.length >= 24 && sniffImageType(bytes) === 'image/png') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (sniffImageType(bytes) === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (
        marker === undefined ||
        marker < 0xc0 ||
        marker > 0xcf ||
        marker === 0xc4 ||
        marker === 0xc8 ||
        marker === 0xcc
      ) {
        offset += 2 + length;
        continue;
      }
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    return undefined;
  }
  if (sniffImageType(bytes) === 'image/webp' && bytes.length >= 30) {
    const chunk = String.fromCharCode(
      bytes[12] ?? 0,
      bytes[13] ?? 0,
      bytes[14] ?? 0,
      bytes[15] ?? 0,
    );
    if (chunk === 'VP8X') {
      return {
        width: 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)),
        height: 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)),
      };
    }
    if (
      chunk === 'VP8 ' &&
      (bytes[23] ?? 0) === 0x9d &&
      (bytes[24] ?? 0) === 0x01 &&
      (bytes[25] ?? 0) === 0x2a
    ) {
      return {
        width: ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff,
        height: ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && (bytes[20] ?? 0) === 0x2f) {
      const b0 = bytes[21] ?? 0;
      const b1 = bytes[22] ?? 0;
      const b2 = bytes[23] ?? 0;
      const b3 = bytes[24] ?? 0;
      return {
        width: 1 + ((b0 | (b1 << 8)) & 0x3fff),
        height: 1 + (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff),
      };
    }
  }
  return undefined;
}
export type MediaMarkerReason = 'aged_out' | 'excluded' | 'overflow';
export interface MediaMarker {
  afterToolCallId: string;
  relPath: string;
  reason: MediaMarkerReason;
}
interface ToolGroup {
  anchor: string;
  members: { message: HistoryMessage; index: number; payload: FileToolResult }[];
  userTurnsAfter: number;
}
export interface MaterializableSelection {
  selected: ToolGroup[];
  markers: MediaMarker[];
  aggregate: { afterToolCallId: string; count: number } | undefined;
}
function groupToolMessages(messages: HistoryMessage[]): ToolGroup[] {
  const groups: ToolGroup[] = [];
  let current: ToolGroup | undefined;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (message.role === 'assistant' && Array.isArray(message.toolCalls)) {
      current = undefined;
      continue;
    }
    if (message.role === 'user') {
      current = undefined;
      for (const group of groups) {
        group.userTurnsAfter += 1;
      }
      continue;
    }
    if (message.role !== 'tool' || typeof message.content !== 'string') {
      current = undefined;
      continue;
    }
    const payload = parseFileToolResult(message.name ?? '', message.content);
    if (!payload || !VISION_IMAGE_TYPES.includes(payload.mediaType)) {
      current = undefined;
      continue;
    }
    if (!current) {
      current = { anchor: message.toolCallId ?? '', members: [], userTurnsAfter: 0 };
      groups.push(current);
    }
    current.anchor = message.toolCallId ?? current.anchor;
    current.members.push({ message, index, payload });
  }
  return groups;
}
export function selectMaterializable(
  messages: HistoryMessage[],
  excluded?: ReadonlyMap<string, MediaMarker>,
): MaterializableSelection {
  const groups = groupToolMessages(messages);
  const eligible = groups.filter(
    (group) =>
      group.userTurnsAfter < MAX_MATERIALIZED_AGE_USER_TURNS &&
      !group.members.some((member) => excluded?.has(member.payload.relPath)),
  );
  const selected = eligible.slice(-MAX_MATERIALIZED_IMAGES);
  const selectedKeys = new Set(selected.map((group) => group.anchor));
  const markers: MediaMarker[] = [];
  for (const group of groups) {
    if (selectedKeys.has(group.anchor)) {
      continue;
    }
    const member = group.members[0];
    if (!member) {
      continue;
    }
    let reason: MediaMarkerReason = 'overflow';
    if (group.userTurnsAfter >= MAX_MATERIALIZED_AGE_USER_TURNS) {
      reason = 'aged_out';
    } else if (group.members.some((m) => excluded?.has(m.payload.relPath))) {
      reason = 'excluded';
    }
    markers.push({ afterToolCallId: group.anchor, relPath: member.payload.relPath, reason });
  }
  let aggregate: { afterToolCallId: string; count: number } | undefined;
  if (markers.length > MAX_STUB_GROUPS) {
    const collapsed = markers.length - MAX_STUB_GROUPS;
    aggregate = { afterToolCallId: markers[0]?.afterToolCallId ?? '', count: collapsed };
    markers.splice(0, collapsed);
  }
  return { selected, markers, aggregate };
}
export interface ToolStat {
  size: number;
}
export interface ToolRead {
  bytes: Uint8Array;
  mediaType?: string;
}
export interface MaterializeOptions {
  textOnlyReason?: string;
  excluded?: ReadonlyMap<string, MediaMarker>;
}
function noteText(reason: MaterializationReason, relPath: string, hint?: string): string {
  if (reason === 'too_large' && hint) {
    return `[image ${relPath} not shown: ${reason} — ${hint}]`;
  }
  return `[image ${relPath} not shown: ${reason}]`;
}
function stubText(marker: MediaMarker): string {
  if (marker.reason === 'aged_out') {
    return `[image ${marker.relPath} no longer shown — re-read with file_read_image]`;
  }
  if (marker.reason === 'excluded') {
    return `[image ${marker.relPath} not delivered: provider rejected media — will retry next turns]`;
  }
  return `[image ${marker.relPath} not shown]`;
}
function textInsert(afterToolCallId: string, text: string): MediaInsert {
  return { afterToolCallId, message: { role: 'user', content: [{ type: 'text', text }] } };
}
export function buildMediaInsert(caption: string, parts: MediaPart[]): HistoryMessage {
  return { role: 'user', content: [{ type: 'text', text: caption }, ...parts] };
}
interface CandidateFailure {
  reason: MaterializationReason;
  hint?: string;
}
function failureOf(error: unknown): CandidateFailure {
  const reason = (error as { reason?: string }).reason;
  if (reason === 'file_missing' || reason === 'policy_denied' || reason === 'read_error') {
    return { reason };
  }
  return { reason: 'read_error' };
}
export async function materializeToolMedia(
  messages: HistoryMessage[],
  statFn: (relPath: string) => ToolStat,
  readFn: (relPath: string) => ToolRead | Promise<ToolRead>,
  options?: MaterializeOptions,
): Promise<ToolMedia> {
  const { selected, markers, aggregate } = selectMaterializable(messages, options?.excluded);
  const inserts = new Map<string, MediaInsert>();
  let materialized = 0;
  let failed = 0;
  let totalBase64 = 0;
  const markerTexts = markers.map((marker) => ({
    marker,
    text: stubText(marker),
  }));
  for (const group of selected) {
    const parts: MediaPart[] = [];
    for (const member of group.members) {
      const relPath = member.payload.relPath;
      let failure: CandidateFailure | undefined;
      let bytes: Uint8Array | undefined;
      let sniffed: string | undefined;
      try {
        const stat = statFn(relPath);
        if (stat.size > MAX_IMAGE_BYTES) {
          failure = { reason: 'too_large' };
        } else {
          const read = await readFn(relPath);
          bytes = read.bytes;
          sniffed = sniffImageType(bytes);
          if (sniffed === undefined) {
            failure = { reason: 'not_image' };
          } else {
            const dims = sniffImageDimensions(bytes);
            const longSide = Math.max(dims?.width ?? 0, dims?.height ?? 0);
            if (longSide > MAX_IMAGE_DIMENSION) {
              failure = {
                reason: 'too_large',
                hint: 'call file_read_image on this path for a downscaled copy',
              };
            }
          }
        }
      } catch (error) {
        failure = failureOf(error);
      }
      if (failure !== undefined || bytes === undefined) {
        parts.push({
          type: 'text',
          text: noteText(failure?.reason ?? 'read_error', relPath, failure?.hint),
        });
        failed += 1;
        continue;
      }
      const base64 = Buffer.from(bytes).toString('base64');
      if (totalBase64 + base64.length > (MAX_MATERIALIZED_BYTES_TOTAL * 4) / 3) {
        parts.push({ type: 'text', text: noteText('too_large', relPath) });
        failed += 1;
        continue;
      }
      totalBase64 += base64.length;
      if (options?.textOnlyReason !== undefined) {
        parts.push({
          type: 'text',
          text: `[image ${relPath} not delivered: ${options.textOnlyReason}]`,
        });
        materialized += 1;
        continue;
      }
      parts.push({
        type: 'text',
        text: `[image from ${member.message.name ?? 'tool'} (call ${member.message.toolCallId ?? ''}) ${relPath}]`,
      });
      parts.push({ type: 'file', mediaType: sniffed ?? member.payload.mediaType, data: base64 });
      materialized += 1;
    }
    if (parts.length === 0) {
      continue;
    }
    inserts.set(group.anchor, {
      afterToolCallId: group.anchor,
      message: buildMediaInsert(`[images from tools]`, parts),
    });
  }
  for (const { marker, text } of markerTexts) {
    if (!inserts.has(marker.afterToolCallId)) {
      inserts.set(marker.afterToolCallId, textInsert(marker.afterToolCallId, text));
    }
  }
  if (aggregate) {
    const text = `[+${aggregate.count} older images not shown]`;
    if (!inserts.has(aggregate.afterToolCallId)) {
      inserts.set(aggregate.afterToolCallId, textInsert(aggregate.afterToolCallId, text));
    }
  }
  return { inserts: [...inserts.values()], stats: { materialized, failed } };
}
export function buildToolMessage(call: {
  toolCallId: string;
  name: string;
  content: string;
}): ToolMessage {
  return buildToolMessageRaw(call.toolCallId, call.name, call.content);
}
