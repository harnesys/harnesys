export type MachineOrgRole = 'relay' | 'worker';

export interface MachineOrgEntry {
  orgId: string;
  name: string;
  description?: string;
  role: MachineOrgRole;
  relayUrl: string | null;
  localDbPath: string | null;
}

export interface OrgMachineFile {
  version: 1;
  orgs: MachineOrgEntry[];
  activeOrgId: string | null;
}

export interface OrgNodeIdentity {
  orgId: string;
  nodeId: string;
  nodeName: string;
  role: 'worker';
  relayUrl: string;
  token: string;
}
