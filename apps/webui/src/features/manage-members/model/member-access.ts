import { INVITE_PRESETS, MEMBER_CAPABILITIES, type MemberCapability } from '@/shared/api/members';

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
  custom: 'Custom',
} as const;

export type MemberRole = keyof typeof ROLE_LABELS;

export const ROLE_ORDER: readonly MemberRole[] = ['owner', 'admin', 'operator', 'viewer', 'custom'];

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Full control, including deleting the organization and promoting relays.',
  admin: 'Everything except deleting the organization and promoting relays.',
  operator: 'Desk, runs, sources, terminal, agents and schedules.',
  viewer: 'Read-only: organization, desk and sources.',
  custom: 'Hand-picked capabilities.',
};

export interface CapabilityGroup {
  label: string;
  capabilities: readonly MemberCapability[];
}

export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  { label: 'Organization', capabilities: ['org.read', 'org.update', 'org.delete'] },
  { label: 'Members', capabilities: ['member.read', 'member.invite', 'member.manage'] },
  { label: 'Fleet', capabilities: ['fleet.read', 'fleet.invite', 'fleet.manage', 'host.promote'] },
  { label: 'Desk & runs', capabilities: ['desk.read', 'desk.write', 'run.start', 'run.cancel'] },
  { label: 'Sources', capabilities: ['source.read', 'source.write'] },
  { label: 'Secrets', capabilities: ['secret.read', 'secret.write'] },
  {
    label: 'Automation',
    capabilities: ['terminal.open', 'terminal.open:ro', 'agent.manage', 'schedule.manage'],
  },
];

export const CAPABILITY_LABELS: Record<MemberCapability, string> = {
  'org.read': 'View organization',
  'org.update': 'Edit organization',
  'org.delete': 'Delete organization',
  'member.read': 'View members',
  'member.invite': 'Invite members',
  'member.manage': 'Manage member access',
  'fleet.read': 'View fleet',
  'fleet.invite': 'Invite hosts',
  'fleet.manage': 'Manage fleet',
  'host.promote': 'Promote relays',
  'desk.read': 'View desk',
  'desk.write': 'Edit desk',
  'run.start': 'Start runs',
  'run.cancel': 'Cancel runs',
  'source.read': 'View sources',
  'source.write': 'Edit sources',
  'secret.read': 'Read secrets',
  'secret.write': 'Edit secrets',
  'terminal.open': 'Open terminals',
  'terminal.open:ro': 'View terminals',
  'agent.manage': 'Manage agents',
  'schedule.manage': 'Manage schedules',
};

export function roleCapabilities(role: MemberRole): readonly MemberCapability[] {
  return role === 'custom' ? [] : INVITE_PRESETS[role];
}

export function matchesPreset(
  capabilities: readonly string[],
  preset: readonly MemberCapability[],
): boolean {
  return (
    preset.length === capabilities.length &&
    preset.every((capability) => capabilities.includes(capability))
  );
}

export function membershipRole(capabilities: readonly string[]): MemberRole {
  if (matchesPreset(capabilities, MEMBER_CAPABILITIES)) {
    return 'owner';
  }
  for (const role of ['admin', 'operator', 'viewer'] as const) {
    if (matchesPreset(capabilities, INVITE_PRESETS[role])) {
      return role;
    }
  }
  return 'custom';
}

export function roleRank(role: MemberRole): number {
  return ROLE_ORDER.indexOf(role);
}

export interface CapabilityCoverage {
  label: string;
  granted: number;
  total: number;
}

export function capabilityCoverage(capabilities: readonly string[]): CapabilityCoverage[] {
  const present = new Set(capabilities);
  return CAPABILITY_GROUPS.map((group) => ({
    label: group.label,
    granted: group.capabilities.filter((capability) => present.has(capability)).length,
    total: group.capabilities.length,
  }));
}

export function accessSummary(capabilities: readonly string[]): string {
  const present = new Set(capabilities);
  const granted = MEMBER_CAPABILITIES.filter((capability) => present.has(capability)).length;
  if (granted === 0) {
    return 'No access';
  }
  if (granted === MEMBER_CAPABILITIES.length) {
    return 'Full access';
  }
  return `${granted} of ${MEMBER_CAPABILITIES.length}`;
}

export function accessTitle(capabilities: readonly string[]): string {
  const present = new Set(capabilities);
  const granted = MEMBER_CAPABILITIES.filter((capability) => present.has(capability)).length;
  const areas = capabilityCoverage(capabilities)
    .map((area) => `${area.label}: ${area.granted}/${area.total}`)
    .join(' · ');
  return `${granted} of ${MEMBER_CAPABILITIES.length} capabilities · ${areas}`;
}
