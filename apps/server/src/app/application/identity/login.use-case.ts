import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import {
  AccountLockedException,
  InvalidCredentialsException,
} from '../../domain/identity/identity.error.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import type { UserRecord } from '../../domain/identity/user-repository.port.ts';
import {
  type LoginAttemptRow,
  LoginAttemptStore,
  UserRepository,
} from '../../domain/identity/user-repository.port.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';
import { mintOpaqueToken } from './mint-token.ts';
import {
  ACCESS_TTL_SEC,
  isoAt,
  REFRESH_ABSOLUTE_SEC,
  REFRESH_IDLE_SEC,
  type SessionTokens,
} from './session-tokens.ts';

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_FAILURE_LIMIT = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const TIMING_PARITY_HASH_INPUT = 'harnesys-unknown-login';

let timingParityHash: string | null = null;

export interface LoginInput {
  login: string;
  password: string;
  now?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly attempts: LoginAttemptStore,
    private readonly sessions: SessionStore,
    private readonly hasher: PasswordHasher,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: LoginInput): Promise<SessionTokens> {
    const now = input.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);
    const locked = this.lockException(input.login, nowMs);
    if (locked) {
      this.audit.append(
        identityAuditRow(now, {
          actorKind: 'anonymous',
          actorId: input.login,
          action: 'locked',
          result: 'denied',
          reason: 'account locked',
        }),
      );
      throw locked;
    }
    const user = await this.authenticate(input.login, input.password);
    if (!user) {
      this.attempts.record(input.login, now);
      this.audit.append(
        identityAuditRow(now, {
          actorKind: 'anonymous',
          actorId: input.login,
          action: 'login_failed',
          result: 'denied',
          reason: null,
        }),
      );
      throw new InvalidCredentialsException();
    }
    const tokens = await this.startSession(user.id, now, nowMs);
    this.attempts.clear(input.login);
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: user.id,
        action: 'login',
        result: 'ok',
        reason: null,
      }),
    );
    return tokens;
  }

  private lockException(login: string, nowMs: number): AccountLockedException | null {
    const failures = this.attempts.listSince(login, isoAt(nowMs - LOCKOUT_WINDOW_MS));
    if (failures.length < LOCKOUT_FAILURE_LIMIT) {
      return null;
    }
    const lastFailureMs = Date.parse((failures[failures.length - 1] as LoginAttemptRow).at);
    const unlockAtMs = lastFailureMs + LOCKOUT_DURATION_MS;
    if (unlockAtMs <= nowMs) {
      return null;
    }
    return new AccountLockedException(Math.ceil((unlockAtMs - nowMs) / 1000));
  }

  private async authenticate(login: string, password: string): Promise<UserRecord | null> {
    const user = this.users.findByLogin(login);
    if (!user) {
      await equalizeTiming(this.hasher, password);
      return null;
    }
    const verified = await this.hasher.verify(password, user.passwordHash);
    return verified ? user : null;
  }

  private async startSession(userId: string, now: string, nowMs: number): Promise<SessionTokens> {
    const accessToken = mintOpaqueToken();
    const refreshToken = mintOpaqueToken();
    const refreshExpiresAt = isoAt(nowMs + REFRESH_ABSOLUTE_SEC * 1000);
    this.sessions.createFamily({
      id: randomUUID(),
      familyId: randomUUID(),
      userId,
      orgId: '',
      refreshHash: await hashToken(refreshToken),
      accessHash: await hashToken(accessToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: isoAt(nowMs + REFRESH_IDLE_SEC * 1000),
      absoluteExpiresAt: refreshExpiresAt,
    });
    return {
      accessToken,
      accessExpiresAt: isoAt(nowMs + ACCESS_TTL_SEC * 1000),
      refreshToken,
      refreshExpiresAt,
    };
  }
}

async function equalizeTiming(hasher: PasswordHasher, password: string): Promise<void> {
  timingParityHash ??= await hasher.hash(TIMING_PARITY_HASH_INPUT);
  await hasher.verify(password, timingParityHash);
}
