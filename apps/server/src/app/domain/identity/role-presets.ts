import type { Capability } from './capability.ts';

export type OrgRole = 'owner' | 'admin' | 'operator' | 'viewer';

const OWNER: Capability[] = [
  'org.read',
  'org.update',
  'org.delete',
  'member.read',
  'member.invite',
  'member.manage',
  'fleet.read',
  'fleet.invite',
  'fleet.manage',
  'host.promote',
  'desk.read',
  'desk.write',
  'run.start',
  'run.cancel',
  'source.read',
  'source.write',
  'secret.read',
  'secret.write',
  'terminal.open',
  'agent.manage',
  'schedule.manage',
];

const ADMIN: Capability[] = [
  'org.read',
  'org.update',
  'member.read',
  'member.invite',
  'member.manage',
  'fleet.read',
  'fleet.invite',
  'fleet.manage',
  'desk.read',
  'desk.write',
  'run.start',
  'run.cancel',
  'source.read',
  'source.write',
  'secret.read',
  'secret.write',
  'terminal.open',
  'agent.manage',
  'schedule.manage',
];

const OPERATOR: Capability[] = [
  'org.read',
  'fleet.read',
  'desk.read',
  'desk.write',
  'run.start',
  'run.cancel',
  'source.read',
  'source.write',
  'terminal.open',
  'agent.manage',
  'schedule.manage',
];

const VIEWER: Capability[] = ['org.read', 'desk.read', 'source.read'];

export const ROLE_PRESETS: Record<OrgRole, Capability[]> = {
  owner: OWNER,
  admin: ADMIN,
  operator: OPERATOR,
  viewer: VIEWER,
};
