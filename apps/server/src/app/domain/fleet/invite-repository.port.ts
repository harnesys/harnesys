export interface InviteRecord {
  id: string;
  nodeName: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface IssueInviteRecordInput {
  id: string;
  code: string;
  nodeName: string;
  expiresAt: string;
  createdAt: string;
}

export abstract class InviteRepository {
  abstract insert(orgId: string, invite: IssueInviteRecordInput): void;
  abstract findByCode(orgId: string, code: string): InviteRecord | null;
  abstract markUsed(orgId: string, inviteId: string, usedAt: string): void;
  abstract listActive(orgId: string, nowIso: string): InviteRecord[];
  abstract revoke(orgId: string, inviteId: string, usedAt: string): boolean;
}
