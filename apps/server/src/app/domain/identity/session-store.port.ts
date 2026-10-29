export interface SessionRecord {
  id: string;
  familyId: string;
  userId: string;
  orgId: string;
  refreshHash: string;
  accessHash: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface CreateFamilyInput {
  id: string;
  familyId: string;
  userId: string;
  orgId: string;
  refreshHash: string;
  accessHash: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export interface RotatedSessionInput {
  id: string;
  familyId: string;
  userId: string;
  orgId: string;
  refreshHash: string;
  accessHash: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export interface ConsumedRefreshRecord {
  refreshHash: string;
  familyId: string;
  consumedAt: string;
}

export interface ActiveUserSessionRow {
  familyId: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export abstract class SessionStore {
  abstract createFamily(input: CreateFamilyInput): void;
  abstract rotate(session: RotatedSessionInput, oldRefreshHash: string): void;
  abstract consumeRefresh(refreshHash: string, familyId: string, consumedAt: string): void;
  abstract revokeFamily(familyId: string, revokedAt: string, reason: string): void;
  abstract revokeUserFamilies(userId: string, revokedAt: string, reason: string): void;
  abstract revokeUserFamiliesExcept(
    userId: string,
    exceptFamilyId: string,
    revokedAt: string,
    reason: string,
  ): void;
  abstract listActiveByUser(userId: string): ActiveUserSessionRow[];
  abstract findByAccessHash(accessHash: string): SessionRecord | null;
  abstract findByRefreshHash(refreshHash: string): SessionRecord | null;
  abstract findConsumedRefresh(refreshHash: string): ConsumedRefreshRecord | null;
  abstract replaceAccessHash(sessionId: string, accessHash: string): void;
}
