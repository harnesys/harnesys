import path from 'node:path';
import type { FileAction } from '../../ports/file-access.ts';
import type { ToolCallGate, ToolContext, ToolGateContext } from '../../ports/tools.ts';
import type { FilesOptions } from './files-options.ts';
import { canonicalizePath, resolveAllowedPath } from './path-resolve.ts';

interface GatePaths {
  cwd: string;
  paths?: { threadDir?: string };
}

function anchorTarget(ctx: GatePaths, target: string): string {
  const threadDir = ctx.paths?.threadDir;
  if (target.startsWith('thread:')) {
    if (!threadDir) {
      throw new Error(`thread: locator without threadDir: ${target}`);
    }
    return canonicalizePath(ctx.cwd, path.join(threadDir, target.slice('thread:'.length)));
  }
  return canonicalizePath(ctx.cwd, target);
}

export function fileAccessGate(
  action: FileAction,
  pathOf: (input: unknown) => string | undefined,
): (input: unknown, ctx: ToolGateContext) => ToolCallGate | undefined {
  return (input, ctx) => {
    if (!ctx.fileAccess || ctx.cwd.length === 0) {
      return undefined;
    }
    const target = pathOf(input);
    if (target === undefined) {
      return undefined;
    }
    const canonical = anchorTarget(ctx, target);
    return ctx.fileAccess({ path: canonical, action });
  };
}

export function ensureFileAccess(ctx: ToolContext, target: string, action: FileAction): void {
  if (!ctx.fileAccess) {
    return;
  }
  const canonical = anchorTarget(ctx, target);
  const gate = ctx.fileAccess({ path: canonical, action });
  if (gate.decision === 'deny') {
    throw new Error(`File access denied: ${target} (${gate.reason})`);
  }
}

export function resolveFileTarget(
  ctx: ToolContext,
  target: string,
  action: FileAction,
  options: FilesOptions,
): string {
  if (ctx.fileAccess) {
    const canonical = anchorTarget(ctx, target);
    const gate = ctx.fileAccess({ path: canonical, action });
    if (gate.decision === 'deny') {
      throw new Error(`File access denied: ${target} (${gate.reason})`);
    }
    return canonical;
  }
  if (target.startsWith('thread:')) {
    const threadDir = ctx.paths.threadDir;
    if (!threadDir) {
      throw new Error(`thread: locator without threadDir: ${target}`);
    }
    return canonicalizePath(ctx.cwd, path.join(threadDir, target.slice('thread:'.length)));
  }
  return resolveAllowedPath(ctx.cwd, target, ctx.paths.allow, options.root);
}

export function fileAccessAllows(ctx: ToolContext, canonical: string): boolean {
  if (!ctx.fileAccess) {
    return true;
  }
  return ctx.fileAccess({ path: canonical, action: 'read' }).decision === 'allow';
}
