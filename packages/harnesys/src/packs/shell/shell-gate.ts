import path from 'node:path';
import type { ToolCallGate } from '../../ports/tools.ts';
import { firstMatchingCommandPattern, matchProgram } from './command-glob.ts';
import { extractNested, isTainted, segmentCommand } from './shell-chain.ts';
import { SHELL_FLOOR_PATTERNS } from './shell-floor.ts';

interface ShellGateScope {
  cwd?: string;
  paths?: { threadDir?: string };
}
const REDIRECT_TARGET_RE = /(?:\d+&|&)?>{1,2}\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|>]+))/g;
function redirectTargetsOf(segment: string): string[] {
  const out: string[] = [];
  for (const m of segment.matchAll(REDIRECT_TARGET_RE)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (raw.length > 0 && raw !== '/dev/null') {
      out.push(raw);
    }
  }
  return out;
}
function insideRoot(target: string, root: string): boolean {
  const t = path.normalize(target);
  const r = path.normalize(root);
  return t === r || t.startsWith(`${r}/`);
}
function writesOutsideRoots(
  segments: readonly string[],
  scope: ShellGateScope | undefined,
): boolean {
  const roots = [scope?.cwd, scope?.paths?.threadDir].filter((r): r is string => Boolean(r));
  const targets = segments.flatMap(redirectTargetsOf);
  if (targets.length === 0) {
    return false;
  }
  if (roots.length === 0) {
    return true;
  }
  return targets.some((target) => {
    if (target.startsWith('~')) {
      return true;
    }
    const abs = path.isAbsolute(target)
      ? path.normalize(target)
      : path.resolve(roots[0] ?? '.', target);
    return !roots.some((root) => insideRoot(abs, root));
  });
}
export function gateShellCommand(
  input: unknown,
  allowlist: readonly string[],
  blocklist: readonly string[],
  scope?: ShellGateScope,
): ToolCallGate | undefined {
  const command =
    typeof (
      input as {
        command?: unknown;
      }
    )?.command === 'string'
      ? (
          input as {
            command: string;
          }
        ).command
      : '';
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return undefined;
  }
  const segments = segmentCommand(command.trim())
    .map((segment) => segment.replace(/\s+/g, ' '))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return undefined;
  }
  const nested = extractNested(command.trim())
    .map((payload) => payload.replace(/\s+/g, ' ').trim())
    .filter((payload) => payload.length > 0);
  for (const candidate of [normalized, ...segments, ...nested]) {
    const floor = firstMatchingCommandPattern(candidate, SHELL_FLOOR_PATTERNS);
    if (floor !== undefined) {
      return {
        decision: 'deny',
        reason: `command blocked by shell floor (${floor}): ${normalized}`,
      };
    }
  }
  for (const candidate of [normalized, ...segments, ...nested]) {
    const blocked = firstMatchingCommandPattern(candidate, blocklist);
    if (blocked !== undefined) {
      return {
        decision: 'deny',
        reason: `command blocked by shell blocklist (${blocked}): ${normalized}`,
      };
    }
  }
  if (segments.some((segment) => isTainted(segment))) {
    return undefined;
  }
  const exactAllowed = allowlist.some((entry) => {
    const entryNormalized = entry.trim().replace(/\s+/g, ' ');
    return (
      entryNormalized === normalized &&
      !entryNormalized.includes('*') &&
      !entryNormalized.includes('?')
    );
  });
  if (exactAllowed) {
    return { decision: 'allow' };
  }
  if (
    allowlist.length > 0 &&
    segments.every(
      (segment) =>
        firstMatchingCommandPattern(segment, allowlist) !== undefined ||
        matchProgram(segment, allowlist) !== undefined,
    )
  ) {
    if (writesOutsideRoots(segments, scope)) {
      return undefined;
    }
    return { decision: 'allow' };
  }
  return undefined;
}
