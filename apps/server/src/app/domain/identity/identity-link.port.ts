export interface IdentityLinkRecord {
  userId: string;
  provider: string;
  providerUserId: string;
  displayName: string | null;
  handle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkIdentityInput {
  userId: string;
  provider: string;
  providerUserId: string;
  displayName?: string | null;
  handle?: string | null;
  at: string;
}

export interface IssueIdentityLinkCodeInput {
  userId: string;
  provider: string;
  codeHash: string;
  expiresAt: string;
  at: string;
}

export interface ConsumeIdentityLinkCodeInput {
  provider: string;
  codeHash: string;
  at: string;
}

export interface ConsumedIdentityLinkCode {
  userId: string;
}

export abstract class IdentityLinkRepository {
  abstract link(input: LinkIdentityInput): IdentityLinkRecord;
  abstract findByIdentity(provider: string, providerUserId: string): IdentityLinkRecord | null;
  abstract findForUser(userId: string, provider: string): IdentityLinkRecord | null;
  abstract listByUser(userId: string): IdentityLinkRecord[];
  abstract unlink(userId: string, provider: string): void;
  abstract issueCode(input: IssueIdentityLinkCodeInput): void;
  abstract consumeCode(input: ConsumeIdentityLinkCodeInput): ConsumedIdentityLinkCode | null;
}
