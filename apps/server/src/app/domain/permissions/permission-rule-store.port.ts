import type { PermissionRuleEffect, PermissionRuleKind } from '@harnesys/contracts';

export type { PermissionRuleEffect, PermissionRuleKind };

export interface PermissionRuleRecord {
  id: string;
  orgId: string;
  agentId: string | null;
  hostId: string | null;
  kind: PermissionRuleKind;
  pattern: string;
  action: 'read' | 'edit' | null;
  effect: PermissionRuleEffect;
  decidedBy: string | null;
  createdAt: string;
}

export interface PermissionRuleWriteInput {
  agentId?: string | null;
  hostId?: string | null;
  kind: PermissionRuleKind;
  pattern: string;
  action?: 'read' | 'edit';
  effect: PermissionRuleEffect;
  decidedBy?: string;
}

export interface PermissionRuleFilter {
  agentId?: string | null;
  kind?: PermissionRuleKind;
}

export interface ShellRulePatterns {
  allow: string[];
  deny: string[];
}

export abstract class PermissionRuleStorePort {
  abstract record(orgId: string, input: PermissionRuleWriteInput): PermissionRuleRecord;
  abstract list(orgId: string, filter?: PermissionRuleFilter): PermissionRuleRecord[];
  abstract revoke(orgId: string, ruleId: string): boolean;
  abstract hasOperation(orgId: string, agentId: string, operation: string): boolean;
  abstract shellPatterns(orgId: string, agentId: string): ShellRulePatterns;
}
