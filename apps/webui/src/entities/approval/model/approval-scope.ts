import type { ApprovalRule, CommandApprovalRule } from '@harnesys/contracts';
import { programOf, segmentCommand } from '@harnesys/studio-shared';
import { programOfCommand } from './shell-command';

export type ApprovalTarget = 'agent' | 'global';

export type FileScopeLevel = 'exact' | 'dir';

export interface FileScopeOption {
  level: FileScopeLevel;
  label: string;
  pattern: string;
}

export type ShellScopeKind = 'exact' | 'program' | 'segments';

export interface ShellScopeOption {
  kind: ShellScopeKind;
  label: string;
  pattern: string;
  detail?: string;
}

export type ApprovalScope = FileScopeOption | ShellScopeOption;

const DIR_DEFAULT_TOOLS = new Set(['grep', 'list_dir', 'glob']);

export function isDirAskTool(toolName: string | undefined): boolean {
  return toolName !== undefined && DIR_DEFAULT_TOOLS.has(toolName);
}

export function fileScopeOptions(
  canonicalPath: string,
  toolName: string | undefined,
): FileScopeOption[] {
  if (isDirAskTool(toolName)) {
    if (canonicalPath === '/') {
      return [];
    }
    return [{ level: 'dir', label: 'Everything in folder', pattern: `${canonicalPath}/**` }];
  }
  const options: FileScopeOption[] = [
    { level: 'exact', label: 'This exact file', pattern: canonicalPath },
  ];
  const parent = parentOf(canonicalPath);
  if (parent.length > 1) {
    options.push({
      level: 'dir',
      label: 'Everything in folder',
      pattern: `${parent}/**`,
    });
  }
  return options;
}

export function defaultFileScope(
  canonicalPath: string,
  toolName: string | undefined,
): FileScopeOption | null {
  const options = fileScopeOptions(canonicalPath, toolName);
  if (isDirAskTool(toolName)) {
    return options[0] ?? null;
  }
  return options.find((option) => option.level === 'exact') ?? options[0] ?? null;
}

export function defaultShellScope(options: ShellScopeOption[]): ShellScopeOption | null {
  return (
    options.find((option) => option.kind === 'segments') ??
    options.find((option) => option.kind === 'program') ??
    options[0] ??
    null
  );
}

export function shellScopeOptions(command: string): ShellScopeOption[] {
  const trimmed = command.trim();
  const options: ShellScopeOption[] = [];
  if (trimmed.length === 0) {
    return options;
  }
  if (isSingleSegment(trimmed)) {
    options.push({ kind: 'exact', label: 'This exact command', pattern: trimmed });
    const program = programOfCommand(trimmed);
    if (program.length > 0) {
      options.push({
        kind: 'program',
        label: `Any \`${program}\` command`,
        pattern: `${program} *`,
      });
    }
    return options;
  }
  options.push({ kind: 'exact', label: 'Just this exact chain', pattern: trimmed });
  const detail = shellSegmentPrograms(trimmed)
    .map((program) => `${program} *`)
    .join('  ');
  if (detail.length > 0) {
    options.push({ kind: 'segments', label: 'These commands always', pattern: trimmed, detail });
  }
  return options;
}

export function shellSegmentPrograms(command: string): string[] {
  return [
    ...new Set(
      segmentCommand(command)
        .map(programOf)
        .filter((program) => program.length > 0),
    ),
  ];
}

export function isSingleSegment(command: string): boolean {
  return !/[;&|`$(]/.test(command);
}

export function ruleOf(scope: ApprovalScope, target: ApprovalTarget): ApprovalRule {
  if ('level' in scope) {
    return {
      kind: 'file-path',
      pattern: scope.pattern,
      target,
      effect: 'allow',
    };
  }
  return shellRuleOf(scope, target);
}

function shellRuleOf(scope: ShellScopeOption, target: ApprovalTarget): CommandApprovalRule {
  if (scope.kind === 'segments') {
    return { kind: 'exact', pattern: scope.pattern, target, commandScope: 'segments' };
  }
  return { kind: scope.kind, pattern: scope.pattern, target };
}

function parentOf(canonicalPath: string): string {
  const index = canonicalPath.lastIndexOf('/');
  if (index <= 0) {
    return '/';
  }
  return canonicalPath.slice(0, index);
}
