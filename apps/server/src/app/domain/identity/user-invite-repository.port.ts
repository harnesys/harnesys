export interface UserInviteRecord {
  id: string;
  orgId: string;
  codeHash: string;
  capabilities: string[];
  expiresAt: string;
  usedAt: string | null;
  createdBy: string;
}

export interface InsertUserInviteInput {
  id: string;
  orgId: string;
  codeHash: string;
  capabilities: string[];
  expiresAt: string;
  createdBy: string;
}

export abstract class UserInviteStore {
  abstract insert(invite: InsertUserInviteInput): void;
  abstract findByCodeHash(codeHash: string): UserInviteRecord | null;
  abstract markUsed(id: string, usedAt: string): void;
}
