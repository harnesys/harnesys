export type Capability =
  | 'org.read'
  | 'org.update'
  | 'org.delete'
  | 'member.read'
  | 'member.invite'
  | 'member.manage'
  | 'fleet.read'
  | 'fleet.invite'
  | 'fleet.manage'
  | 'host.promote'
  | 'desk.read'
  | 'desk.write'
  | 'run.start'
  | 'run.cancel'
  | 'source.read'
  | 'source.write'
  | 'secret.read'
  | 'secret.write'
  | 'terminal.open'
  | 'agent.manage'
  | 'schedule.manage';

export const CAPABILITIES: readonly Capability[] = [
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

export type NodeAction =
  | 'heartbeat'
  | 'work.claim'
  | 'fleet.channel'
  | 'source.materialize'
  | 'run.execute';

export const NODE_ACTIONS: readonly NodeAction[] = [
  'heartbeat',
  'work.claim',
  'fleet.channel',
  'source.materialize',
  'run.execute',
];
