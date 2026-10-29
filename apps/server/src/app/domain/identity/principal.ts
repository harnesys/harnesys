export interface UserPrincipal {
  kind: 'user';
  userId: string;
  capabilities: string[];
  orgId: string;
}

export interface NodePrincipal {
  kind: 'node';
  nodeId: string;
  orgId: string;
}

export type Principal = UserPrincipal | NodePrincipal;
