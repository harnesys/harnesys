export interface FileRuleRecord {
  id: string;
  orgId: string;
  agentId: string | null;
  hostId: string | null;
  pathPattern: string;
  action: 'read' | 'edit';
  effect: 'allow' | 'deny';
  createdAt: string;
  updatedAt: string;
}

export interface FileRuleInsert {
  orgId: string;
  agentId: string | null;
  hostId: string | null;
  pathPattern: string;
  action: 'read' | 'edit';
  effect: 'allow' | 'deny';
}
