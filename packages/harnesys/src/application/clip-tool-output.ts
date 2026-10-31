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
/**
 * Writes the full text next to the thread and returns a locator the model can read back:
 * `thread:tool-outputs/<file>` inside the thread dir, or a workdir-relative path otherwise.
 */
export async function spillTextToFile(input: SpillInput): Promise<string | null> {
  const fileName = safeSegment(input.fileName, 'output');
  const threadDir = input.paths?.threadDir;
  if (threadDir) {
    const absolute = path.join(threadDir, TOOL_OUTPUTS_DIR, fileName);
    await mkdir(path.dirname(absolute), { recursive: true });
    await Bun.write(absolute, input.text);
    return `thread:${TOOL_OUTPUTS_DIR}/${fileName}`;
  }
  const cwd = input.paths?.cwd;
  if (!cwd || !input.sessionId) {
    return null;
  }
  const rel = toolOutputRelPath(input.sessionId, fileName);
  const absolute = resolveWorkdirPath(cwd, rel);
  await mkdir(path.dirname(absolute), { recursive: true });
  await Bun.write(absolute, input.text);
  return rel;
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
  let locator: string | null = null;
  try {
    locator = await spillTextToFile({
      paths: input.paths,
      sessionId: input.sessionId,
      fileName: toolOutputFileName(input.toolName, input.toolCallId),
      text: safe,
    });
  } catch {
    locator = null;
  }
  return formatClipped(safe, settings, locator);
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
export function spilledOutputLine(textLength: number, locator: string | null): string {
  return locator
    ? `Full output (${textLength} chars) saved to ${locator}. The view above is head + tail; read the file only if you need the omitted middle.`
    : `Full output (${textLength} chars) could not be saved to a file.`;
}
function formatClipped(
  text: string,
  settings: ResolvedToolOutputSettings,
  locator: string | null,
): string {
  const head = text.slice(0, settings.headChars);
  const tail = text.slice(-settings.tailChars);
  const omitted = Math.max(0, text.length - settings.headChars - settings.tailChars);
  return `${head}\n\n… ${omitted} chars omitted …\n\n${tail}\n\n${spilledOutputLine(text.length, locator)}`;
}
function safeSegment(value: string, fallback: string): string {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
