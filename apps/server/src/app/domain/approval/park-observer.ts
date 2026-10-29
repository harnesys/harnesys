import type { ApprovalBudget, ApprovalOption } from '@harnesys/contracts';
import { APPROVAL_PARK_SOURCES } from '@harnesys/contracts';
import type { FileAction, SessionEvent } from 'harnesys';
import { canonicalizePath } from 'harnesys';
import type {
  ApprovalContext,
  ApprovalDelegatedContext,
  ApprovalFileContext,
  ApprovalKind,
  ApprovalRequestInput,
} from './approval.ts';

export const APPROVAL_PARK_SOURCE_SET: ReadonlySet<string> = new Set(APPROVAL_PARK_SOURCES);

export interface ObservedPark {
  runId: string;
  threadId: string;
  askId: string;
  source: string;
  prompt?: string;
  budget?: ApprovalBudget;
  tool?: ObservedParkTool;
  delegated?: ApprovalDelegatedContext;
}

export interface ObservedParkTool {
  name: string;
  input: unknown;
  toolCallId: string;
}

export interface ParkFileRuntime {
  host: string;
  cwd: string;
  runtime: 'host' | 'container';
}

const PERMISSION_REASON_RE = /^allow (.+)\?$/;
const INPUT_PREVIEW_CHARS = 240;
const DEFAULT_REQUESTED_PATH = '.';
const FILE_TOOL_ACTIONS: Readonly<Record<string, FileAction>> = {
  read_file: 'read',
  list_dir: 'read',
  glob: 'read',
  grep: 'read',
  write_file: 'edit',
  edit_file: 'edit',
};

export function observeParks(
  threadId: string,
  runId: string,
  events: SessionEvent[],
  onPark: (park: ObservedPark) => void,
): void {
  for (const event of events) {
    if (event.type !== 'ask' || !APPROVAL_PARK_SOURCE_SET.has(event.source)) {
      continue;
    }
    const park: ObservedPark = {
      runId,
      threadId,
      askId: event.askId,
      source: event.source,
      ...(event.prompt === undefined ? {} : { prompt: event.prompt }),
      ...(event.budget === undefined ? {} : { budget: event.budget }),
      ...(event.tool === undefined ? {} : { tool: event.tool }),
      ...(event.delegated === undefined ? {} : { delegated: event.delegated }),
    };
    queueMicrotask(() => onPark(park));
  }
}

export function approvalRequestForPark(
  park: ObservedPark,
  thread: { agentId: string } | undefined,
  fileRuntime?: ParkFileRuntime,
): ApprovalRequestInput {
  const file = fileContextOf(park, fileRuntime);
  const kind = file ? 'file_access' : kindFor(park.source);
  const context: ApprovalContext = {
    source: park.source,
    ops: park.source === 'permission' ? permissionOpOf(park.prompt) : undefined,
    tool: toolContextOf(park.tool),
    ...(park.budget === undefined ? {} : { budget: park.budget }),
    ...(file === undefined ? {} : { file }),
    ...(park.delegated === undefined ? {} : { delegated: park.delegated }),
  };
  return {
    runId: park.runId,
    agentId: thread?.agentId ?? '',
    threadId: park.threadId,
    interruptId: park.askId,
    kind,
    question: park.prompt ?? park.source,
    options: optionsOf(kind),
    context,
  };
}

function optionsOf(kind: ApprovalKind): ApprovalOption[] {
  if (kind === 'file_access') {
    return ['deny', 'approve_once', 'approve', 'block_path'];
  }
  return kind === 'tool' ? ['approve', 'approve_once', 'deny'] : spendOptions(kind);
}

const COMMAND_CHARS = 4000;

function toolContextOf(
  tool: ObservedParkTool | undefined,
): { name: string; inputPreview: string; command?: string; truncated?: boolean } | undefined {
  if (!tool) {
    return undefined;
  }
  const preview = previewOf(tool.input);
  const command = shellCommandOf(tool.name, tool.input);
  return {
    name: tool.name,
    inputPreview: preview.text,
    ...(command === undefined ? {} : { command }),
    ...(preview.truncated && command === undefined ? { truncated: true } : {}),
  };
}

function shellCommandOf(name: string, input: unknown): string | undefined {
  if (name !== 'shell') {
    return undefined;
  }
  const command =
    input !== null && typeof input === 'object'
      ? (input as { command?: unknown }).command
      : undefined;
  if (typeof command !== 'string') {
    return undefined;
  }
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.length > COMMAND_CHARS) {
    return undefined;
  }
  return trimmed;
}

function fileContextOf(
  park: ObservedPark,
  fileRuntime: ParkFileRuntime | undefined,
): ApprovalFileContext | undefined {
  if (park.source !== 'permission' || !fileRuntime || !park.tool) {
    return undefined;
  }
  const action = FILE_TOOL_ACTIONS[park.tool.name];
  if (action === undefined) {
    return undefined;
  }
  const requestedPath = requestedPathOf(park.tool.input);
  return {
    host: fileRuntime.host,
    canonicalPath: canonicalizePath(fileRuntime.cwd, requestedPath),
    requestedPath,
    action,
    runtime: fileRuntime.runtime,
  };
}

function requestedPathOf(input: unknown): string {
  if (input !== null && typeof input === 'object' && 'path' in input) {
    const path = (input as { path?: unknown }).path;
    if (typeof path === 'string' && path.length > 0) {
      return path;
    }
  }
  return DEFAULT_REQUESTED_PATH;
}

function spendOptions(kind: ApprovalKind): ApprovalOption[] {
  return kind === 'spend' ? ['approve', 'close', 'deny'] : ['approve', 'deny'];
}

function kindFor(source: string): ApprovalKind {
  if (source === 'budget') {
    return 'spend';
  }
  if (source === 'interrupt') {
    return 'question';
  }
  return 'tool';
}

function permissionOpOf(prompt: string | undefined): string[] {
  if (prompt === undefined) {
    return [];
  }
  const match = PERMISSION_REASON_RE.exec(prompt);
  return match?.[1] ? [match[1]] : [];
}

function previewOf(input: unknown): { text: string; truncated: boolean } {
  let text: string;
  try {
    text = JSON.stringify(input) ?? '';
  } catch {
    text = String(input);
  }
  if (text.length > INPUT_PREVIEW_CHARS) {
    return { text: `${text.slice(0, INPUT_PREVIEW_CHARS)}…`, truncated: true };
  }
  return { text, truncated: false };
}
