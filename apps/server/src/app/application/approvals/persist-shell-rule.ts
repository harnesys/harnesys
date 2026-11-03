import type { CommandApprovalRule } from '@harnesys/contracts';
import {
  firstMatchingCommandPattern,
  programOf,
  SHELL_FLOOR_PATTERNS,
  segmentCommand,
} from 'harnesys';
import { ApprovalValidationException } from '../../domain/approval/approval.error.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';

export interface PersistShellRuleDeps {
  rules: PermissionRuleStorePort;
}

export interface PersistShellRuleInput {
  orgId: string;
  agentId: string;
  defaultModeId: string | null;
  rule: CommandApprovalRule;
  decidedBy?: string;
}

export function shellRulePatternsOf(rule: CommandApprovalRule): string[] {
  const pattern = normalizePattern(rule.pattern);
  rejectEmptyPattern(pattern);
  rejectFloorPattern(pattern);
  if (rule.commandScope !== 'segments') {
    return [pattern];
  }
  return segmentProgramPatternsOf(pattern);
}

export function persistShellRule(deps: PersistShellRuleDeps, input: PersistShellRuleInput): void {
  const patterns = shellRulePatternsOf(input.rule);
  const targetAgentId =
    input.rule.target === 'global' && input.defaultModeId ? null : input.agentId;
  for (const pattern of patterns) {
    deps.rules.record(input.orgId, {
      kind: 'shell-cmd',
      pattern,
      effect: 'allow',
      ...(targetAgentId === null ? {} : { agentId: targetAgentId }),
      ...(input.decidedBy !== undefined ? { decidedBy: input.decidedBy } : {}),
    });
  }
}

function normalizePattern(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function rejectEmptyPattern(pattern: string): void {
  if (pattern.length === 0) {
    throw new ApprovalValidationException('rule pattern must not be empty');
  }
}

function rejectFloorPattern(pattern: string): void {
  const candidates = [
    pattern,
    ...segmentCommand(pattern).map((segment) => segment.replace(/\s+/g, ' ').trim()),
  ];
  for (const candidate of candidates) {
    if (candidate.length === 0) {
      continue;
    }
    const hit = firstMatchingCommandPattern(candidate, SHELL_FLOOR_PATTERNS);
    if (hit !== undefined) {
      throw new ApprovalValidationException(`rule pattern blocked by shell floor (${hit})`);
    }
  }
}

function segmentProgramPatternsOf(pattern: string): string[] {
  const segments = segmentCommand(pattern)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return [pattern];
  }
  const patterns: string[] = [];
  for (const program of segments.map(programOf)) {
    const wildcard = `${program} *`;
    if (program.length === 0 || patterns.includes(wildcard)) {
      continue;
    }
    rejectFloorPattern(wildcard);
    patterns.push(wildcard);
  }
  return patterns;
}
