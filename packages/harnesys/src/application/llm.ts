import { statSync } from 'node:fs';
import { callModel, driverErrorStatus, type StreamChunk } from '../adapters/ai-llm-adapter.ts';
import { mediaDeliveryGates } from '../adapters/ai-llm-provider.ts';
import { EXCLUSION_TTL_USER_TURNS, LLM_CHUNK_EVENTS } from '../constants.ts';
import type { AgentDefinition, AgentModelRef } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { FileAccessPolicy } from '../ports/file-access.ts';
import type { ModelBinding, ResolvedModel } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { RuntimePromptInfo } from '../ports/runtime-prompt.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import {
  resolveThreadPath,
  attachmentReader as threadAttachmentReader,
} from './attachment-reader.ts';
import { evalExpr, substitutePrompt } from './expr-eval.ts';
import { materializeMessageAttachments } from './fold-attachments.ts';
import { resolveAgentModelRef, stateKeyOf } from './graph-helpers.ts';
import { emitHook, type HookEmitCtx, hookBlockedReason } from './hooks/emit-hook.ts';
import { assembleNotes, type LlmNote } from './llm-notes.ts';
import { buildRequestPlan } from './llm-request-plan.ts';
import { effectiveSkillRegistry, type PackRunOutput } from './packs/pack-run.ts';
import { formatSkillsCatalog, skillCatalogEntries } from './skills/skills-catalog.ts';
import { type HistoryMessage, type MediaInsert, materializeToolMedia } from './tool-message.ts';
import { formatDeferredCatalog, loadedToolsOf, resolveProgressiveTools } from './tools/exposure.ts';
export interface LlmNode {
  type: 'llm:generate';
  prompt: string;
  messages?: string;
  tools?: string[];
  model?: string | AgentModelRef;
  output?: unknown;
}
export interface LlmContext {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  input: unknown;
  output?: unknown;
  modelBinding: ModelBinding;
  toolRegistry: Map<string, ToolDefinition>;
  signal: AbortSignal;
  notes?: LlmNote[];
  notesErrors?: string[];
  packOutputs?: PackRunOutput[];
  skills?: SkillRegistry;
  paths?: PathsConfig;
  permissions?: PermissionMap;
  hooks?: HookEmitCtx;
  steps?: number;
  sessionId?: string;
  runId?: string;
  channelNote?: string;
  runtime?: RuntimePromptInfo;
  fileAccess?: FileAccessPolicy;
  excludedMediaRelPaths?: Map<string, { reason: string; untilTurn: number }>;
}
export function formatRuntimeSection(runtime: RuntimePromptInfo | undefined): string {
  if (!runtime) {
    return '';
  }
  const lines = ['Runtime for this run:'];
  lines.push(`- Host: ${runtime.hostName}`);
  lines.push(`- Environment: ${runtime.environment === 'container' ? 'Container' : 'Host'}`);
  lines.push(`- Run root: ${runtime.primaryDirectory} (${runtime.primaryKind})`);
  lines.push(
    '- All file tools accept absolute paths; stay inside the run root — access outside it requires user approval.',
  );
  const workspace = workspaceLinesOf(runtime);
  if (workspace.length > 0) {
    lines.push(...workspace);
  } else {
    lines.push(`- Temporary workspace: ${runtime.threadSandbox}`);
  }
  if (runtime.sharedSources.length > 0) {
    lines.push('- Shared sources available to this run:');
    for (const source of runtime.sharedSources) {
      const description = source.description ? ` — ${source.description}` : '';
      lines.push(`  - ${source.name} (${source.indexState}): ${source.path}${description}`);
    }
  }
  lines.push(
    "- Thread files: `thread:`-prefixed paths address this conversation's storage (`attachments/`, `sandbox/`); pass them to tools verbatim; attachment files are read-only.",
  );
  lines.push(
    '- File links in user messages are real host paths (strip the `:line` suffix before tool calls); reads outside allowed roots request approval.',
  );
  return lines.join('\n');
}
function workspaceLinesOf(runtime: RuntimePromptInfo): string[] {
  const scratch = `- Scratch: ${runtime.threadSandbox} (private, temporary — keep only temp files here)`;
  const source = runtime.primarySource;
  if (runtime.primaryKind === 'source' && source) {
    const workspace =
      source.kind === 'git'
        ? `- Workspace: ${runtime.primaryDirectory} — active checkout of "${source.name}" on ${source.branch ?? ''} (shared state; check git status before editing; never run parallel issues here)`
        : `- Workspace: ${runtime.primaryDirectory} — source "${source.name}" (shared folder; changes are immediate)`;
    return [workspace, scratch];
  }
  const worktree = runtime.worktree;
  if (runtime.primaryKind === 'worktree' && worktree) {
    return [
      `- Workspace: ${worktree.path} — git worktree of "${worktree.repository}" @ ${worktree.branch} (isolated; deliver via the branch)`,
      scratch,
    ];
  }
  if (runtime.primaryKind === 'directory') {
    return [
      `- Workspace: ${runtime.primaryDirectory} — directory bound to this thread (shared host state; changes are immediate)`,
      scratch,
    ];
  }
  return [];
}
function formatAvailableToolsSection(
  names: string[],
  registry: Map<string, ToolDefinition>,
): string {
  if (names.length === 0) {
    return '';
  }
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const tool = registry.get(name);
    if (!tool) {
      continue;
    }
    const group = tool.group ?? 'other';
    groups.set(group, [...(groups.get(group) ?? []), name]);
  }
  if (groups.size === 0) {
    return '';
  }
  const lines = ['Capabilities available in this model call:'];
  for (const [group, tools] of groups) {
    lines.push(`- ${group}: ${tools.join(', ')}`);
  }
  lines.push('Use only capabilities listed here or tools exposed by the deferred tool catalog.');
  return lines.join('\n');
}

export { mediaDeliveryGates } from '../adapters/ai-llm-provider.ts';
export interface MediaExclusion {
  reason: string;
  untilTurn: number;
}
function activeExclusions(
  map: Map<string, MediaExclusion> | undefined,
  currentTurn: number,
): Map<
  string,
  { afterToolCallId: string; relPath: string; reason: 'aged_out' | 'excluded' | 'overflow' }
> {
  const out = new Map<
    string,
    { afterToolCallId: string; relPath: string; reason: 'aged_out' | 'excluded' | 'overflow' }
  >();
  if (!map) {
    return out;
  }
  for (const [relPath, entry] of map) {
    if (entry.untilTurn > currentTurn) {
      out.set(relPath, { afterToolCallId: '', relPath, reason: 'excluded' });
    }
  }
  return out;
}
function gateClosedReason(model: ResolvedModel): string {
  return mediaDeliveryGates(model) ? '' : 'model has no image input';
}
function toolStatFn(paths: PathsConfig | undefined): (relPath: string) => { size: number } {
  return (relPath) => {
    const abs = resolveThreadPath(relPath, paths);
    try {
      return { size: statSync(abs).size };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw toolStatError('file_missing', `File not found: ${abs}`);
      }
      throw toolStatError('read_error', `Failed to stat file: ${abs}`);
    }
  };
}

interface ToolStatError extends Error {
  reason: ToolStatReason;
}

type ToolStatReason = 'file_missing' | 'read_error';

function toolStatError(reason: ToolStatReason, message: string): ToolStatError {
  const error = new Error(message) as ToolStatError;
  error.reason = reason;
  return error;
}
function materializedRelPathsOf(inserts: MediaInsert[]): string[] {
  const out: string[] = [];
  for (const insert of inserts) {
    const content = insert.message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    let caption = '';
    for (const part of content as Record<string, unknown>[]) {
      if (part.type === 'text' && typeof part.text === 'string') {
        caption = part.text;
        continue;
      }
      if (part.type === 'file') {
        const match = /\[image from .* (thread:\S+)\]$/.exec(caption);
        if (match?.[1]) {
          out.push(match[1]);
        }
      }
    }
  }
  return out;
}
function driverStatusOf(error: unknown): number | undefined {
  const direct = (error as { statusCode?: unknown }).statusCode;
  if (typeof direct === 'number') {
    return direct;
  }
  return driverErrorStatus(error);
}
function contextLengthRejection(error: unknown): boolean {
  const haystack = `${(error as { name?: string }).name ?? ''} ${(error as Error).message ?? ''} ${(error as { code?: string }).code ?? ''}`;
  return /context|token|length|too many/i.test(haystack);
}
export interface LlmResult {
  finishReason: string;
  text?: string;
  reasoning?: string;
  toolCalls?: unknown[];
  structured?: unknown;
  sources?: unknown[];
  files?: unknown[];
  usage?: unknown;
  outputReserved?: boolean;
}
function ensureMessages(node: LlmNode, state: Record<string, unknown>, input: unknown): void {
  if (!node.messages) {
    return;
  }
  const key = stateKeyOf(node.messages);
  if (!key) {
    return;
  }
  if (state[key] !== undefined) {
    return;
  }
  const inp = input as {
    messages?: unknown;
  };
  state[key] = Array.isArray(inp?.messages) ? [...(inp.messages as unknown[])] : [];
}
function resolveMessages(node: LlmNode, ctx: LlmContext): unknown[] {
  if (!node.messages) {
    return [];
  }
  try {
    const v = evalExpr(node.messages, {
      input: ctx.input,
      state: ctx.state,
      output: ctx.output ?? null,
      resume: null,
    });
    return Array.isArray(v) ? (v as unknown[]) : [];
  } catch {
    return [];
  }
}
export async function* runLlmGenerate(
  node: LlmNode,
  ctx: LlmContext,
): AsyncGenerator<{
  type: string;
  data?: unknown;
}> {
  ensureMessages(node, ctx.state, ctx.input);
  const promptDef = ctx.agent.prompts[node.prompt];
  const agentText = promptDef ? promptDef.instructions : '';
  const slots = {
    input: ctx.input,
    state: ctx.state,
    output: ctx.output ?? null,
    resume: null,
  };
  const prompt = substitutePrompt(agentText, slots);
  const projected = projectCompacted(resolveMessages(node, ctx));
  const resolved = node.tools ?? [...ctx.toolRegistry.keys()];
  const progressive = resolveProgressiveTools(resolved, ctx.toolRegistry, loadedToolsOf(ctx.state));
  const toolNames = progressive.toolNames;
  const runtimeSection = formatRuntimeSection(ctx.runtime);
  const toolsSection = formatAvailableToolsSection(toolNames, ctx.toolRegistry);
  const skillList = ctx.skills
    ? await effectiveSkillRegistry(ctx.agent, ctx.skills, ctx.packOutputs ?? []).list()
    : [];
  const skillsSection = formatSkillsCatalog(skillList);
  const instructions = [prompt, ctx.channelNote, skillsSection, runtimeSection, toolsSection]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');
  const allNotes = ctx.notes ? [...ctx.notes] : [];
  if (
    progressive.deferredPending.length > 0 &&
    !(Array.isArray(node.tools) && node.tools.length === 0)
  ) {
    allNotes.push({
      tag: 'tools',
      text: formatDeferredCatalog(progressive.deferredPending, ctx.toolRegistry),
    });
  }
  const tailText = allNotes.length > 0 ? assembleNotes(allNotes) : '';
  const reader = threadAttachmentReader({ paths: ctx.paths, fileAccess: ctx.fileAccess });
  const history = await materializeMessageAttachments(projected.messages, reader);
  const currentTurn = projected.messages.filter(
    (message) =>
      !!message &&
      typeof message === 'object' &&
      (message as Record<string, unknown>).role === 'user',
  ).length;
  const exclusions = activeExclusions(ctx.excludedMediaRelPaths, currentTurn);
  const closedReason = gateClosedReason(ctx.modelBinding.model);
  const withMedia = await materializeToolMedia(
    history as HistoryMessage[],
    toolStatFn(ctx.paths),
    reader,
    {
      ...(closedReason ? { textOnlyReason: closedReason } : {}),
      excluded: exclusions,
    },
  );
  const inserts = withMedia.inserts;
  const requestMessages = buildRequestMessages(history, projected.prefix, tailText, inserts);
  const plan = buildRequestPlan({
    prompt,
    channelNote: ctx.channelNote ?? '',
    skillsSection,
    runtimeSection,
    instructions,
    skillEntries: skillCatalogEntries(skillList),
    toolNames,
    toolRegistry: ctx.toolRegistry,
    notes: allNotes,
    requestMessages,
  });
  yield {
    type: 'model.stats',
    data: {
      tools: toolNames.length,
      deferredPending: progressive.deferredPending.length,
      systemChars: instructions.length,
      notesChars: allNotes.reduce((sum, n) => sum + n.text.length, 0),
      notesErrors: ctx.notesErrors ?? [],
      materialized: withMedia.stats.materialized,
      failed: withMedia.stats.failed,
      plan,
    },
  };
  const modelRef = resolveAgentModelRef(node.model, ctx.agent);
  const hookModel = { provider: ctx.modelBinding.driver, model: ctx.modelBinding.name };
  const pre = await emitHook(ctx.hooks, 'PreModelCall', { model: hookModel });
  const preBlocked = hookBlockedReason(pre);
  if (preBlocked !== undefined) {
    throw codedRunError('model_call_blocked', preBlocked);
  }
  const callOptions = (messages: unknown[]) => ({
    binding: ctx.modelBinding,
    prompt: instructions,
    messages,
    toolNames,
    signalOrRegistry: ctx.toolRegistry,
    maybeSignal: ctx.signal,
    outputSchema: node.output as Record<string, unknown> | undefined,
    settings: {
      effort: modelRef?.effort,
      generation: modelRef?.generation,
    },
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    rawRequestDir: ctx.paths?.threadDir,
    rawRequestMode: ctx.agent.observability?.rawRequests ?? 'full',
    rawRequestPlan: plan,
  });
  async function* drain(messages: unknown[]): AsyncGenerator<{ type: string; data?: unknown }> {
    const stream = callModel(callOptions(messages));
    for await (const chunk of stream) {
      const type = LLM_CHUNK_EVENTS[chunk.type];
      if (type) {
        yield { type, data: chunk };
      } else if (chunk.type === 'completed') {
        lastChunk = chunk;
      }
    }
  }
  let lastChunk: StreamChunk | undefined;
  const runMessages = requestMessages;
  const retriedMessages = buildRequestMessages(history, projected.prefix, tailText, []);
  try {
    yield* drain(runMessages);
  } catch (error) {
    const status = driverStatusOf(error);
    if (inserts.length === 0 || (status !== 400 && status !== 413)) {
      throw error;
    }
    const mediaRetry = `media_retry_${status}`;
    if (!contextLengthRejection(error) && ctx.excludedMediaRelPaths) {
      const untilTurn = currentTurn + EXCLUSION_TTL_USER_TURNS;
      for (const relPath of materializedRelPathsOf(inserts)) {
        ctx.excludedMediaRelPaths.set(relPath, {
          reason: 'provider_rejected_media',
          untilTurn,
        });
      }
    }
    yield {
      type: 'model.stats',
      data: {
        mediaRetry,
        materialized: withMedia.stats.materialized,
        failed: withMedia.stats.failed,
      },
    };
    yield* drain(retriedMessages);
  }
  if (lastChunk && lastChunk.type === 'completed') {
    const res = lastChunk;
    let structured: unknown;
    let outputReserved = false;
    if (res.structured && typeof res.structured === 'object' && res.structured !== null) {
      const s = res.structured as Record<string, unknown>;
      if ('finishReason' in s || 'text' in s || 'toolCalls' in s) {
        outputReserved = true;
      }
      structured = res.structured;
    }
    const out: LlmResult = {
      finishReason: res.finishReason,
      text: res.text,
      reasoning: res.reasoning,
      toolCalls: res.toolCalls as unknown[] | undefined,
      structured,
      sources: res.sources,
      files: res.files,
      usage: res.usage,
      outputReserved,
    };
    if (structured && typeof structured === 'object' && structured !== null) {
      const rec = structured as Record<string, unknown>;
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (k === 'finishReason' || k === 'text' || k === 'toolCalls') {
          continue;
        }
        extra[k] = v;
      }
      Object.assign(out, extra);
    }
    await emitHook(ctx.hooks, 'PostModelCall', {
      model: hookModel,
      usage: { steps: ctx.steps ?? 0, tokens: usageTokensOf(res.usage) },
    });
    yield { type: 'model.completed', data: out };
  }
}
function usageTokensOf(usage: unknown): number {
  if (!usage || typeof usage !== 'object') {
    return 0;
  }
  const u = usage as Record<string, unknown>;
  if (typeof u.totalTokens === 'number' && Number.isFinite(u.totalTokens)) {
    return u.totalTokens;
  }
  const input = typeof u.inputTokens === 'number' ? u.inputTokens : 0;
  const output = typeof u.outputTokens === 'number' ? u.outputTokens : 0;
  return input + output;
}
const SUMMARY_MARKER = '[Conversation summary of earlier messages]';
export function buildRequestMessages(
  history: unknown[],
  summary: string,
  tailText: string,
  inserts: MediaInsert[] = [],
): unknown[] {
  const out = [...history];
  const placed: { at: number; message: HistoryMessage }[] = [];
  for (const insert of inserts) {
    let anchorIndex = out.findIndex(
      (message) =>
        !!message &&
        typeof message === 'object' &&
        (message as Record<string, unknown>).role === 'tool' &&
        (message as Record<string, unknown>).toolCallId === insert.afterToolCallId,
    );
    if (anchorIndex === -1) {
      continue;
    }
    let next = out[anchorIndex + 1] as Record<string, unknown> | undefined;
    while (next && next.role === 'tool') {
      anchorIndex += 1;
      next = out[anchorIndex + 1] as Record<string, unknown> | undefined;
    }
    placed.push({ at: anchorIndex + 1, message: insert.message });
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    const entry = placed[i];
    if (entry) {
      out.splice(entry.at, 0, entry.message);
    }
  }
  if (summary.trim().length > 0) {
    out.push({ role: 'user', content: `${SUMMARY_MARKER}\n\n${summary}` });
  }
  if (tailText.length > 0) {
    out.push({ role: 'user', content: tailText });
  }
  return out;
}
export interface CompactedProjection {
  prefix: string;
  messages: unknown[];
}
export function projectCompacted(messages: readonly unknown[]): CompactedProjection {
  let anchorIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (m && typeof m === 'object' && m.kind === 'compaction') {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) {
    return { prefix: '', messages: [...messages] };
  }
  const anchor = messages[anchorIndex] as Record<string, unknown>;
  const until = typeof anchor.coveredUntil === 'number' ? anchor.coveredUntil : -1;
  const out: unknown[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (i === anchorIndex || i <= until) {
      continue;
    }
    out.push(messages[i]);
  }
  return { prefix: String(anchor.content ?? ''), messages: out };
}
export function projectedForEstimate(projected: CompactedProjection): unknown[] {
  if (!projected.prefix.trim()) {
    return projected.messages;
  }
  return [{ role: 'system', content: projected.prefix }, ...projected.messages];
}
