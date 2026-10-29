import type { SessionEvent } from '@harnesys/studio-shared';
import { toolCaption } from './tool-caption';
import type { ToolDetail } from './tool-detail-types';
import { asObject, has, parseJson } from './tool-json';
import { isDiffOutput, parseDiffDetail } from './tool-output-diff';
import {
  isFileOutput,
  isGlobOutput,
  isGrepOutput,
  isListDirOutput,
  parseFileDetail,
  parseGlobDetail,
  parseGrepDetail,
  parseListDirDetail,
} from './tool-output-file';
import {
  isHttpOutput,
  isShellOutput,
  parseGenericDetail,
  parseHttpDetail,
  parseTerminalDetail,
  parseWriteFileDetail,
} from './tool-output-shell';

export type {
  CodeLine,
  DiffDetail,
  DiffHunk,
  DiffHunkLine,
  EntriesDetail,
  FileDetail,
  GenericDetail,
  GrepDetail,
  GrepMatchItem,
  HttpDetail,
  ListEntryItem,
  TerminalDetail,
  ToolDetail,
} from './tool-detail-types';
export { detectLanguage, toolMeta } from './tool-detail-types';

function toolInput(
  call: SessionEvent & {
    type: 'tool';
  },
): string {
  const input = call.input;
  if (input == null) {
    return '';
  }
  return typeof input === 'string' ? input : JSON.stringify(input);
}
function toolOutput(
  result: SessionEvent & {
    type: 'tool';
  },
): string {
  const output = result.output;
  if (output == null) {
    return '';
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}
interface DetailContext {
  done: boolean;
  outputObj: Record<string, unknown> | undefined;
  rawOutput: string;
  input: Record<string, unknown> | undefined;
  hint: string;
  title: string;
}

export function toolDetail(
  call: SessionEvent & {
    type: 'tool';
  },
  result?: SessionEvent & {
    type: 'tool';
  },
): ToolDetail {
  const caption = toolCaption(call, result);
  const inputStr = toolInput(call);
  const input = asObject(parseJson(inputStr));
  const done = result
    ? result.phase === 'completed' || result.phase === 'failed'
    : call.phase === 'completed' || call.phase === 'failed';
  const rawOutput = result ? toolOutput(result) : '';
  const output = done ? parseJson(rawOutput) : undefined;
  const ctx: DetailContext = {
    done,
    outputObj: asObject(output),
    rawOutput,
    input,
    hint: caption.hint,
    title: caption.title,
  };
  const toolName = call.name;
  return (
    fileDetail(toolName, ctx) ??
    streamDetail(toolName, ctx) ??
    parseGenericDetail(output, rawOutput, caption.title)
  );
}

function fileDetail(toolName: string, ctx: DetailContext): ToolDetail | undefined {
  if ((ctx.done && toolName === 'edit_file') || isDiffOutput(ctx.outputObj, ctx.rawOutput)) {
    const parsedDiff = parseDiffDetail(ctx.outputObj, ctx.rawOutput, ctx.input);
    if (parsedDiff) {
      return parsedDiff;
    }
  }
  if ((ctx.done && toolName === 'read_file') || isFileOutput(ctx.outputObj)) {
    const file = parseFileDetail(ctx.outputObj, ctx.rawOutput, ctx.input, ctx.hint);
    if (file) {
      return file;
    }
  }
  if ((ctx.done && toolName === 'list_dir') || isListDirOutput(ctx.outputObj)) {
    return parseListDirDetail(ctx.outputObj, ctx.input);
  }
  if ((ctx.done && toolName === 'glob') || isGlobOutput(ctx.outputObj)) {
    return parseGlobDetail(ctx.outputObj, ctx.input);
  }
  if ((ctx.done && toolName === 'grep') || isGrepOutput(ctx.outputObj)) {
    return parseGrepDetail(ctx.outputObj, ctx.input);
  }
  return undefined;
}

function streamDetail(toolName: string, ctx: DetailContext): ToolDetail | undefined {
  if ((ctx.done && toolName === 'shell') || isShellOutput(ctx.outputObj)) {
    return parseTerminalDetail(ctx.outputObj, ctx.rawOutput, ctx.input);
  }
  if ((ctx.done && (toolName === 'http' || toolName === 'fetch')) || isHttpOutput(ctx.outputObj)) {
    return parseHttpDetail(ctx.outputObj, ctx.input);
  }
  if (ctx.done && toolName === 'write_file' && ctx.outputObj && has(ctx.outputObj, 'bytes')) {
    return parseWriteFileDetail(ctx.outputObj, ctx.input, ctx.title);
  }
  return undefined;
}
export function formatToolInput(raw: string | undefined): {
  json: boolean;
  formatted: string;
} {
  if (!raw || raw.trim().length === 0) {
    return { json: false, formatted: '(no input parameters)' };
  }
  const parsed = parseJson(raw);
  if (parsed !== undefined) {
    return { json: true, formatted: JSON.stringify(parsed, null, 2) };
  }
  return { json: false, formatted: raw };
}
