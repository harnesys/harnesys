import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveWorkdirPath } from '../adapters/actions/path-resolve.ts';
import type { ToolOutputSettings } from '../domain/agent-definition.ts';
import {
  type ResolvedToolOutputSettings,
  resolveToolOutputSettings,
} from '../domain/tool-output.ts';
import type { PathsConfig } from '../ports/paths.ts';
import { redactSecrets } from './redact-secrets.ts';
export function serializeToolOutput(value: unknown): string {
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
const TOOL_OUTPUTS_DIR = 'tool-outputs';
function toolOutputRelPath(sessionId: string, fileName: string): string {
  return `.harnesys/threads/${sessionId}/${TOOL_OUTPUTS_DIR}/${fileName}`;
}
function toolOutputFileName(toolName: string, toolCallId: string): string {
  return `${safeSegment(toolName, 'tool')}-${safeSegment(toolCallId, 'call')}.txt`;
}
export interface SpillInput {
  fileName: string;
  text: string;
  sessionId: string;
  paths?: PathsConfig;
}
export async function spillTextToFile(input: SpillInput): Promise<string | null> {
  const fileName = safeSegment(input.fileName, 'output');
  const threadDir = input.paths?.threadDir;
  if (threadDir) {
    const absolute = path.join(threadDir, TOOL_OUTPUTS_DIR, fileName);
    await mkdir(path.dirname(absolute), { recursive: true });
    await Bun.write(absolute, input.text);
    return absolute;
  }
  const cwd = input.paths?.cwd;
  if (!cwd || !input.sessionId) {
    return null;
  }
  const absolute = resolveWorkdirPath(cwd, toolOutputRelPath(input.sessionId, fileName));
  await mkdir(path.dirname(absolute), { recursive: true });
  await Bun.write(absolute, input.text);
  return absolute;
}
export async function presentToolOutput(input: {
  value: unknown;
  toolName: string;
  toolCallId: string;
  sessionId: string;
  paths?: PathsConfig;
  settings?: ToolOutputSettings | null;
}): Promise<string> {
  const text = serializeToolOutput(input.value);
  const settings = resolveToolOutputSettings(input.settings);
  const safe = settings.redactSecrets ? redactSecrets(text) : text;
  if (safe.length <= settings.maxChars) {
    return safe;
  }
  let savedPath: string | null = null;
  try {
    savedPath = await spillTextToFile({
      paths: input.paths,
      sessionId: input.sessionId,
      fileName: toolOutputFileName(input.toolName, input.toolCallId),
      text: safe,
    });
  } catch {
    savedPath = null;
  }
  return formatClipped(safe, settings, savedPath);
}
export async function presentCallOutput(
  ctx: {
    sessionId: string;
    paths?: PathsConfig;
    toolOutput?: ToolOutputSettings | null;
  },
  call: {
    id: string;
    name: string;
  },
  value: unknown,
): Promise<string> {
  return await presentToolOutput({
    value,
    toolName: call.name,
    toolCallId: call.id,
    sessionId: ctx.sessionId,
    paths: ctx.paths,
    settings: ctx.toolOutput,
  });
}
export function spilledOutputLine(textLength: number, savedPath: string | null): string {
  return savedPath
    ? `Full output (${textLength} chars) saved to ${savedPath}. The view above is head + tail; read the file only if you need the omitted middle.`
    : `Full output (${textLength} chars) could not be saved to a file.`;
}
function formatClipped(
  text: string,
  settings: ResolvedToolOutputSettings,
  savedPath: string | null,
): string {
  const head = text.slice(0, settings.headChars);
  const tail = text.slice(-settings.tailChars);
  const omitted = Math.max(0, text.length - settings.headChars - settings.tailChars);
  return `${head}\n\n… ${omitted} chars omitted …\n\n${tail}\n\n${spilledOutputLine(text.length, savedPath)}`;
}
function safeSegment(value: string, fallback: string): string {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
