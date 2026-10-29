import type { UpsertMembershipInput } from './user-repository.port.ts';

export interface MembershipRecord {
  userId: string;
  orgId: string;
  capabilities: string[];
  updatedAt: string;
}

export abstract class MembershipRepository {
  abstract upsert(membership: UpsertMembershipInput): void;
  abstract upsertSync(membership: MembershipRecord): void;
  abstract findByUserAndOrg(userId: string, orgId: string): MembershipRecord | null;
  abstract listByUser(userId: string): MembershipRecord[];
  abstract listByOrg(orgId: string): MembershipRecord[];
  abstract remove(userId: string, orgId: string): void;
}
