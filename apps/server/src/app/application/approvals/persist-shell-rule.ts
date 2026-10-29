import type { CommandApprovalRule } from '@harnesys/contracts';
import {
  firstMatchingCommandPattern,
  programOf,
  SHELL_FLOOR_PATTERNS,
  segmentCommand,
} from 'harnesys';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ApprovalValidationException } from '../../domain/approval/approval.error.ts';
import type { ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';

export interface PersistShellRuleDeps {
  agents: AgentRegistryPort;
  modes: ModePresetRegistryPort;
}

export interface PersistShellRuleInput {
  orgId: string;
  agentId: string;
  defaultModeId: string | null;
  rule: CommandApprovalRule;
}

const PACK_CONFIG_KEYS = ['capabilitiesJson', 'packs', 'capabilities'] as const;
const SHELL_SPEC_KEYS = ['allowlist', 'blocklist', 'timeout'] as const;

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
  if (input.rule.target === 'global' && input.defaultModeId) {
    const preset = deps.modes.findById(input.orgId, input.defaultModeId);
    if (preset) {
      persistPresetRule(deps, input.orgId, preset, patterns);
      return;
    }
  }
  const agent = deps.agents.findById(input.orgId, input.agentId);
  if (!agent) {
    return;
  }
  persistAgentRule(deps, input.orgId, agent, patterns);
}

function persistAgentRule(
  deps: PersistShellRuleDeps,
  orgId: string,
  agent: AgentRecord,
  patterns: string[],
): void {
  const key = packsKeyOf(agent.config);
  const raw = agent.config[key];
  const packs = { ...(isRecord(raw) ? raw : {}) };
  const merged = mergeShellPattern(packs.shell, patterns);
  if (!merged.changed) {
    return;
  }
  packs.shell = merged.next;
  deps.agents.update(orgId, agent.id, { config: { ...agent.config, [key]: packs } });
}

function persistPresetRule(
  deps: PersistShellRuleDeps,
  orgId: string,
  preset: ModePresetRecord,
  patterns: string[],
): void {
  const merged = mergeShellPattern(preset.packs.shell, patterns);
  if (!merged.changed) {
    return;
  }
  const spec = merged.next.spec;
  deps.modes.update(orgId, preset.id, {
    packs: { ...preset.packs, shell: { ...(isRecord(spec) ? { spec } : {}) } },
    updatedAt: new Date().toISOString(),
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function packsKeyOf(config: Record<string, unknown>): string {
  for (const key of PACK_CONFIG_KEYS) {
    if (isRecord(config[key])) {
      return key;
    }
  }
  return 'capabilitiesJson';
}

function stringListOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function mergeShellPattern(
  assignment: unknown,
  patterns: string[],
): { next: Record<string, unknown>; changed: boolean } {
  const current = isRecord(assignment) ? assignment : {};
  const nested = isRecord(current.spec) ? current.spec : undefined;
  const base = specBaseOf(current, nested);
  const allowlist = stringListOf(base.allowlist);
  const missing = patterns.filter((pattern) => !allowlist.includes(pattern));
  if (missing.length === 0) {
    return { next: current, changed: false };
  }
  const spec = { ...base, allowlist: [...allowlist, ...missing] };
  return { next: assignmentOf(current, nested, spec), changed: true };
}

function specBaseOf(
  current: Record<string, unknown>,
  nested: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (nested) {
    return { ...nested };
  }
  const base: Record<string, unknown> = {};
  for (const key of SHELL_SPEC_KEYS) {
    if (current[key] !== undefined) {
      base[key] = current[key];
    }
  }
  return base;
}

function assignmentOf(
  current: Record<string, unknown>,
  nested: Record<string, unknown> | undefined,
  spec: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (nested === undefined && (SHELL_SPEC_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    next[key] = value;
  }
  next.spec = spec;
  return next;
}
