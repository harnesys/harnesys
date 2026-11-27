import type { FileAction } from '../../ports/file-access.ts';
import type { ToolCallGate, ToolContext, ToolGate, ToolGateContext } from '../../ports/tools.ts';
import type { FilesOptions } from './files-options.ts';
import { canonicalizePath, resolveAllowedPath } from './path-resolve.ts';

export function fileAccessGate(
  action: FileAction,
  pathOf: (input: unknown) => string | undefined,
): (input: unknown, ctx: ToolGateContext) => ToolCallGate | undefined {
  return fileAccessGateAll(action, [pathOf]);
}

export function fileAccessGateAll(
  action: FileAction,
  pathsOf: Array<(input: unknown) => string | string[] | undefined>,
): ToolGate {
  return (input, ctx) => {
    if (!ctx.fileAccess || ctx.cwd.length === 0) {
      return undefined;
    }
    const decisions: ToolCallGate[] = [];
    for (const pathOf of pathsOf) {
      const targets = pathOf(input);
      for (const target of typeof targets === 'string' ? [targets] : (targets ?? [])) {
        decisions.push(ctx.fileAccess({ path: canonicalizePath(ctx.cwd, target), action }));
      }
    }
    return strictestGate(decisions);
  };
}

function strictestGate(decisions: ToolCallGate[]): ToolCallGate | undefined {
  if (decisions.length === 0) {
    return undefined;
  }
  for (const decision of decisions) {
    if (decision.decision === 'deny') {
      return decision;
    }
  }
  for (const decision of decisions) {
    if (decision.decision === 'ask') {
      return decision;
    }
  }
  return { decision: 'allow' };
}

export function ensureFileAccess(ctx: ToolContext, target: string, action: FileAction): string {
  const canonical = canonicalizePath(ctx.cwd, target);
  if (!ctx.fileAccess) {
    return canonical;
  }
  const gate = ctx.fileAccess({ path: canonical, action });
  if (gate.decision === 'deny') {
    throw new Error(`File access denied: ${target} (${gate.reason})`);
  }
  return canonical;
}

export function resolveFileTarget(
  ctx: ToolContext,
  target: string,
  action: FileAction,
  options: FilesOptions,
): string {
  if (ctx.fileAccess) {
    return ensureFileAccess(ctx, target, action);
  }
  return resolveAllowedPath(ctx.cwd, target, ctx.paths.allow, options.root);
}

export function fileAccessAllows(
  ctx: ToolContext,
  canonical: string,
  action: FileAction = 'read',
): boolean {
  if (!ctx.fileAccess) {
    return true;
  }
  return ctx.fileAccess({ path: canonical, action }).decision === 'allow';
}
