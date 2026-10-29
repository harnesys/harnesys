export interface UserRecord {
  id: string;
  login: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsertUserInput {
  id: string;
  login: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface UpsertMembershipInput {
  userId: string;
  orgId: string;
  capabilities: string[];
  updatedAt: string;
}

export abstract class UserRepository {
  abstract insert(user: InsertUserInput): void;
  abstract findByLogin(login: string): UserRecord | null;
  abstract findById(id: string): UserRecord | null;
  abstract updatePasswordHash(id: string, passwordHash: string, updatedAt: string): void;
  abstract count(): number;
  abstract upsertSync(user: UserRecord): void;
}

export interface LoginAttemptRow {
  login: string;
  at: string;
}

export abstract class LoginAttemptStore {
  abstract record(login: string, at: string): void;
  abstract listSince(login: string, sinceIso: string): LoginAttemptRow[];
  abstract clear(login: string): void;
}
