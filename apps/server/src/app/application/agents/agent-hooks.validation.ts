import type { AgentHook, HookHandlerSpec } from '@harnesys/contracts';
import { HOOK_EVENT_NAMES } from '@harnesys/contracts';
import { hookMatcherApplies } from 'harnesys/domain';

export interface HookIssue {
  path: string;
  message: string;
}

export interface HookValidationContext {
  agentId: string;
  mcpServers: string[];
  agentIds: string[];
}

export type HookValidationResult =
  | { ok: true; hooks: AgentHook[] }
  | { ok: false; issues: HookIssue[] };

const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
const MAX_HOOKS = 50;
const MAX_TIMEOUT_S = 600;
const MIN_TIMEOUT_S = 1;
const KNOWN_EVENTS = new Set<string>(HOOK_EVENT_NAMES);

export function validateAgentHooks(
  hooks: AgentHook[],
  ctx: HookValidationContext,
): HookValidationResult {
  const issues: HookIssue[] = [];
  if (hooks.length > MAX_HOOKS) {
    issues.push({ path: 'hooks', message: `agent supports at most ${MAX_HOOKS} hooks` });
    return { ok: false, issues };
  }
  const seenIds = new Set<string>();
  hooks.forEach((hook, index) => {
    validateHook(hook, index, ctx, seenIds, issues);
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, hooks };
}

function validateHook(
  hook: AgentHook,
  index: number,
  ctx: HookValidationContext,
  seenIds: Set<string>,
  issues: HookIssue[],
): void {
  const path = `hooks[${index}]`;
  if (!KNOWN_EVENTS.has(hook.event)) {
    issues.push({ path: `${path}.event`, message: `unsupported hook event: ${hook.event}` });
    return;
  }
  if (hook.id !== undefined) {
    if (seenIds.has(hook.id)) {
      issues.push({ path: `${path}.id`, message: `duplicate hook id: ${hook.id}` });
    }
    seenIds.add(hook.id);
  }
  if (hook.matcher !== undefined && hook.matcher.trim() !== '') {
    if (!hookMatcherApplies(hook.event)) {
      issues.push({
        path: `${path}.matcher`,
        message: `matcher does not apply to event ${hook.event}`,
      });
    }
  }
  if (hook.timeoutS !== undefined && !isTimeoutValid(hook.timeoutS)) {
    issues.push({
      path: `${path}.timeoutS`,
      message: `timeoutS must be between ${MIN_TIMEOUT_S} and ${MAX_TIMEOUT_S}`,
    });
  }
  validateHandler(hook.handler, `${path}.handler`, ctx, issues);
}

function validateHandler(
  handler: HookHandlerSpec,
  path: string,
  ctx: HookValidationContext,
  issues: HookIssue[],
): void {
  switch (handler.type) {
    case 'command':
      validateCommand(handler, path, issues);
      return;
    case 'http':
      validateHttp(handler, path, issues);
      return;
    case 'mcp_tool':
      validateMcpTool(handler, path, ctx, issues);
      return;
    case 'prompt':
      validatePrompt(handler, path, issues);
      return;
    case 'agent':
      validateAgent(handler, path, ctx, issues);
  }
}

function validateCommand(
  handler: Extract<HookHandlerSpec, { type: 'command' }>,
  path: string,
  issues: HookIssue[],
): void {
  if (handler.command.trim() === '') {
    issues.push({ path: `${path}.command`, message: 'command must not be empty' });
  }
  for (const key of Object.keys(handler.env ?? {})) {
    if (!ENV_KEY_RE.test(key)) {
      issues.push({
        path: `${path}.env.${key}`,
        message: `env key must match ${ENV_KEY_RE.source}`,
      });
    }
  }
}

function validateHttp(
  handler: Extract<HookHandlerSpec, { type: 'http' }>,
  path: string,
  issues: HookIssue[],
): void {
  if (!isHttpUrl(handler.url)) {
    issues.push({ path: `${path}.url`, message: 'url must be an http(s) url' });
  }
}

function validateMcpTool(
  handler: Extract<HookHandlerSpec, { type: 'mcp_tool' }>,
  path: string,
  ctx: HookValidationContext,
  issues: HookIssue[],
): void {
  if (!ctx.mcpServers.includes(handler.server)) {
    issues.push({
      path: `${path}.server`,
      message: `mcp server is not connected to this agent: ${handler.server}`,
    });
  }
  if (handler.tool.trim() === '') {
    issues.push({ path: `${path}.tool`, message: 'tool must not be empty' });
  }
}

function validatePrompt(
  handler: Extract<HookHandlerSpec, { type: 'prompt' }>,
  path: string,
  issues: HookIssue[],
): void {
  if (handler.prompt.trim() === '') {
    issues.push({ path: `${path}.prompt`, message: 'prompt must not be empty' });
  }
}

function validateAgent(
  handler: Extract<HookHandlerSpec, { type: 'agent' }>,
  path: string,
  ctx: HookValidationContext,
  issues: HookIssue[],
): void {
  const agentId = handler.agentId?.trim() ?? '';
  if (agentId === '') {
    issues.push({ path: `${path}.agentId`, message: 'agentId is required' });
    return;
  }
  if (agentId === ctx.agentId) {
    issues.push({ path: `${path}.agentId`, message: 'agent cannot delegate to itself' });
    return;
  }
  if (!ctx.agentIds.includes(agentId)) {
    issues.push({ path: `${path}.agentId`, message: `unknown agent: ${agentId}` });
  }
  if (handler.prompt.trim() === '') {
    issues.push({ path: `${path}.prompt`, message: 'prompt must not be empty' });
  }
}

function isTimeoutValid(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TIMEOUT_S && value <= MAX_TIMEOUT_S;
}

function isHttpUrl(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
