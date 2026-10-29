import type { HookEffect, HookHandler, HookPayload } from '../../domain/hook.ts';
import type { PluginDiagnostic, PluginDiagnosticCode } from '../../domain/plugin-diagnostics.ts';
import type { UserConfigContentOptions } from '../plugins/user-config.ts';
import type { HookRuntimeCtx } from './bus.ts';
import { mapClaudeJsonFields, parseClaudeJsonObject, truncateHookString } from './claude-output.ts';
import { defaultTimeoutS, runCommand, toStdinPayload } from './command-run.ts';
export type HookKillSource = 'timeout' | 'abort' | 'close';
export interface HookProcessEntry {
  pid: number;
  kill(source: HookKillSource): void;
  done: Promise<unknown>;
}
export interface HookProcessRegistry {
  add(entry: HookProcessEntry): void;
  remove(entry: HookProcessEntry): void;
}
export interface HookHandlerVars {
  pluginRoot: string;
  pluginData: string;
  projectDir: string;
  registry?: HookProcessRegistry;
  signal?: AbortSignal;
  userConfig?: UserConfigContentOptions;
}
export interface HookHandlerResult {
  effects: HookEffect[];
  diagnostics: PluginDiagnostic[];
  sessionTitle?: string;
  output?: string;
}
const MCP_PLACEHOLDER = /^\$\{([A-Za-z0-9_.]+)\}$/;
export function runHookHandler(
  h: HookHandler,
  payload: HookPayload,
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  switch (h.type) {
    case 'command':
      return runCommand(h, payload, ctx, vars);
    case 'http':
      return runHttp(h, payload, vars);
    case 'mcp_tool':
      return runMcpTool(h, payload, ctx, vars);
    case 'prompt':
      return runPrompt(h, payload, ctx, vars);
    case 'agent':
      return runAgent(h, payload, ctx, vars);
    case 'inline':
      return runInline(h, payload);
  }
}
async function runHttp(
  h: Extract<
    HookHandler,
    {
      type: 'http';
    }
  >,
  payload: HookPayload,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  const timeoutMs = (h.timeoutS ?? defaultTimeoutS(payload.event, 'http')) * 1000;
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  vars.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...h.headers },
      body: JSON.stringify(toStdinPayload(payload)),
      signal: controller.signal,
    });
    if (vars.signal?.aborted) {
      return { effects: [], diagnostics: [] };
    }
    if (!response.ok) {
      return {
        effects: [],
        diagnostics: [warning('hook_failed', `hook http статус ${response.status}`)],
      };
    }
    const body = await response.text();
    const parsed = parseClaudeJsonObject(body);
    if (parsed === undefined) {
      return {
        effects: [],
        diagnostics: [warning('hook_failed', 'тело ответа hook http не JSON-объект')],
      };
    }
    return { ...mapClaudeJsonFields(parsed), output: truncateHookString(body) };
  } catch (error) {
    if (vars.signal?.aborted) {
      return { effects: [], diagnostics: [] };
    }
    if (controller.signal.aborted) {
      return {
        effects: [],
        diagnostics: [warning('hook_timeout', `hook http timed out after ${timeoutMs}ms`)],
      };
    }
    return {
      effects: [],
      diagnostics: [warning('hook_failed', `hook http не удался: ${errorMessage(error)}`)],
    };
  } finally {
    clearTimeout(timer);
    vars.signal?.removeEventListener('abort', onAbort);
  }
}
async function runMcpTool(
  h: Extract<
    HookHandler,
    {
      type: 'mcp_tool';
    }
  >,
  payload: HookPayload,
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  if (ctx.mcpToolCall === undefined) {
    if (payload.event === 'SessionStart') {
      return { effects: [], diagnostics: [] };
    }
    return {
      effects: [],
      diagnostics: [warning('hook_failed', 'mcp_tool без mcpToolCall в контексте шины')],
    };
  }
  const input = substituteMcpInput(h.input, payload);
  const raced = await raceTimeout(
    ctx.mcpToolCall(h.server, h.tool, input),
    (h.timeoutS ?? defaultTimeoutS(payload.event, 'mcp_tool')) * 1000,
  );
  if (raced.timedOut) {
    return { effects: [], diagnostics: [warning('hook_timeout', 'hook mcp_tool timed out')] };
  }
  if (vars.signal?.aborted) {
    return { effects: [], diagnostics: [] };
  }
  const parsed = resolveJsonObject(raced.value);
  if (parsed === undefined) {
    return {
      effects: [],
      diagnostics: [warning('hook_failed', 'ответ hook mcp_tool не JSON-объект')],
    };
  }
  return mapClaudeJsonFields(parsed);
}
function substituteMcpInput(
  input: Record<string, string> | undefined,
  payload: HookPayload,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input ?? {})) {
    const whole = MCP_PLACEHOLDER.exec(raw);
    const dotted = whole?.[1];
    if (dotted !== undefined) {
      out[key] = lookupPayloadPath(payload, dotted) ?? '';
      continue;
    }
    out[key] = raw.replace(/\$\{([A-Za-z0-9_.]+)\}/g, (_match, dottedPath: string) => {
      const value = lookupPayloadPath(payload, dottedPath);
      if (value === undefined) {
        return '';
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }
  return out;
}
function lookupPayloadPath(payload: HookPayload, dotted: string): unknown {
  let current: unknown = payload;
  for (const segment of dotted.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
async function runPrompt(
  h: Extract<
    HookHandler,
    {
      type: 'prompt';
    }
  >,
  payload: HookPayload,
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  if (ctx.promptModel === undefined) {
    return {
      effects: [],
      diagnostics: [warning('hook_failed', 'prompt-хук без promptModel в контексте шины')],
    };
  }
  const raced = await raceTimeout(
    ctx.promptModel(promptWithPayload(h.prompt, payload), h.model),
    (h.timeoutS ?? defaultTimeoutS(payload.event, 'prompt')) * 1000,
  );
  if (raced.timedOut) {
    return { effects: [], diagnostics: [warning('hook_timeout', 'hook prompt timed out')] };
  }
  if (vars.signal?.aborted) {
    return { effects: [], diagnostics: [] };
  }
  const verdict = resolveJsonObject(raced.value);
  if (verdict === undefined) {
    return {
      effects: [],
      diagnostics: [warning('hook_invalid_output', 'ответ prompt-хука не JSON-объект')],
    };
  }
  if (verdict.ok === true) {
    return { effects: [], diagnostics: [] };
  }
  if (verdict.impossible === true) {
    return { effects: [], diagnostics: [] };
  }
  const reason = typeof verdict.reason === 'string' ? verdict.reason : undefined;
  if (verdict.ok === false) {
    if (reason === undefined) {
      return {
        effects: [],
        diagnostics: [warning('hook_invalid_output', 'ok:false требует reason')],
      };
    }
    return { effects: [{ kind: 'block', reason: truncateHookString(reason) }], diagnostics: [] };
  }
  return {
    effects: [],
    diagnostics: [warning('hook_invalid_output', 'ответ prompt-хука без поля ok')],
  };
}
function promptWithPayload(prompt: string, payload: HookPayload): string {
  const args = JSON.stringify(payload);
  if (prompt.includes('$ARGUMENTS')) {
    return prompt.replaceAll('$ARGUMENTS', args);
  }
  return `${prompt}\n\n${args}`;
}
async function runAgent(
  h: Extract<
    HookHandler,
    {
      type: 'agent';
    }
  >,
  payload: HookPayload,
  ctx: HookRuntimeCtx,
  vars: HookHandlerVars,
): Promise<HookHandlerResult> {
  if (ctx.delegateAgent === undefined) {
    return {
      effects: [],
      diagnostics: [warning('hook_failed', 'agent-хук без delegateAgent в контексте шины')],
    };
  }
  const agentId = h.agentId?.trim() ?? '';
  if (agentId === '') {
    return {
      effects: [],
      diagnostics: [warning('hook_failed', 'agent-хук без agentId')],
    };
  }
  const raced = await raceTimeout(
    ctx.delegateAgent(agentId, promptWithPayload(h.prompt, payload)),
    (h.timeoutS ?? defaultTimeoutS(payload.event, 'agent')) * 1000,
  );
  if (raced.timedOut) {
    return { effects: [], diagnostics: [warning('hook_timeout', 'hook agent timed out')] };
  }
  if (vars.signal?.aborted) {
    return { effects: [], diagnostics: [] };
  }
  const verdict = resolveJsonObject(raced.value);
  if (verdict === undefined) {
    return {
      effects: [{ kind: 'context', text: truncateHookString(raced.value) }],
      diagnostics: [],
    };
  }
  if (verdict.ok === true) {
    return { effects: [], diagnostics: [] };
  }
  if (verdict.ok === false) {
    const reason = typeof verdict.reason === 'string' ? verdict.reason : undefined;
    if (reason === undefined) {
      return {
        effects: [],
        diagnostics: [warning('hook_invalid_output', 'ok:false требует reason')],
      };
    }
    return { effects: [{ kind: 'block', reason: truncateHookString(reason) }], diagnostics: [] };
  }
  return { effects: [{ kind: 'context', text: truncateHookString(raced.value) }], diagnostics: [] };
}

async function runInline(
  h: Extract<
    HookHandler,
    {
      type: 'inline';
    }
  >,
  payload: HookPayload,
): Promise<HookHandlerResult> {
  try {
    const out = await h.fn(payload);
    return { effects: Array.isArray(out) ? out : [], diagnostics: [] };
  } catch (error) {
    return {
      effects: [],
      diagnostics: [warning('hook_failed', `inline-хук упал: ${errorMessage(error)}`)],
    };
  }
}
async function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<
  | {
      timedOut: true;
      value?: undefined;
    }
  | {
      timedOut: false;
      value: T;
    }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{
    timedOut: true;
    value?: undefined;
  }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function resolveJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const parsed = parseClaudeJsonObject(value);
    if (parsed === undefined) {
      return undefined;
    }
    return Object.fromEntries(Object.entries(parsed));
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return undefined;
}
function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}
function warning(code: PluginDiagnosticCode, message: string): PluginDiagnostic {
  return { level: 'warning', code, message };
}
