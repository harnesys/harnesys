import type { ModePresetRegistryPort } from './mode-preset-registry.port.ts';

const PACK_CONFIG_KEYS = ['capabilitiesJson', 'packs', 'capabilities'] as const;
const SHELL_SPEC_KEYS = ['allowlist', 'blocklist', 'timeout'] as const;

export function modeShellSpecOf(
  modes: ModePresetRegistryPort,
  orgId: string,
  modeId: string | undefined,
): Record<string, unknown> | undefined {
  if (!modeId) {
    return undefined;
  }
  const preset = modes.findById(orgId, modeId);
  if (!preset) {
    return undefined;
  }
  const spec = shellSpecBaseOf(preset.packs.shell);
  if (Object.keys(spec).length === 0) {
    return undefined;
  }
  return spec;
}

export function mergeShellAssignment(
  agentAssignment: unknown,
  presetSpec: Record<string, unknown>,
): Record<string, unknown> {
  const agentBase = shellSpecBaseOf(agentAssignment);
  const allowlist = [...stringListOf(agentBase.allowlist)];
  for (const pattern of stringListOf(presetSpec.allowlist)) {
    if (!allowlist.includes(pattern)) {
      allowlist.push(pattern);
    }
  }
  const blocklist = [...stringListOf(presetSpec.blocklist)];
  for (const pattern of stringListOf(agentBase.blocklist)) {
    if (!blocklist.includes(pattern)) {
      blocklist.push(pattern);
    }
  }
  const spec = { ...presetSpec, ...agentBase, allowlist, blocklist };
  return { ...preservedAssignmentKeys(agentAssignment), spec };
}

export function rawShellAssignment(config: Record<string, unknown>): unknown {
  for (const key of PACK_CONFIG_KEYS) {
    const packs = config[key];
    if (isRecord(packs) && 'shell' in packs) {
      return packs.shell;
    }
  }
  return undefined;
}

export function shellSpecBaseOf(assignment: unknown): Record<string, unknown> {
  if (!isRecord(assignment)) {
    return {};
  }
  if (isRecord(assignment.spec)) {
    return { ...assignment.spec };
  }
  const base: Record<string, unknown> = {};
  for (const key of SHELL_SPEC_KEYS) {
    if (assignment[key] !== undefined) {
      base[key] = assignment[key];
    }
  }
  return base;
}

function preservedAssignmentKeys(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    return {};
  }
  const nested = isRecord(raw.spec);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'spec') {
      continue;
    }
    if (!nested && (SHELL_SPEC_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringListOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}
