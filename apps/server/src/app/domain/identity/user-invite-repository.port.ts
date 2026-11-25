export interface UserInviteRecord {
  id: string;
  orgId: string;
  code: string | null;
  codeHash: string;
  capabilities: string[];
  createdAt: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdBy: string;
}

export interface InsertUserInviteInput {
  id: string;
  orgId: string;
  code: string;
  codeHash: string;
  capabilities: string[];
  createdAt: string;
  expiresAt: string;
  createdBy: string;
}

export abstract class UserInviteStore {
  abstract insert(invite: InsertUserInviteInput): void;
  abstract findByCodeHash(codeHash: string): UserInviteRecord | null;
  abstract listByOrg(orgId: string): UserInviteRecord[];
  abstract markUsed(id: string, usedAt: string): void;
  abstract remove(orgId: string, inviteId: string): boolean;
}
