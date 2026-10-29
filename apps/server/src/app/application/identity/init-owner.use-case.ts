import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import { OwnerAlreadyInitializedException } from '../../domain/identity/identity.error.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface InitOwnerInput {
  login: string;
  name: string;
  password: string;
  now?: string;
}

export interface InitOwnerResult {
  userId: string;
}

@Injectable()
export class InitOwnerUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: InitOwnerInput): Promise<InitOwnerResult> {
    if (this.users.count() > 0) {
      throw new OwnerAlreadyInitializedException();
    }
    const now = input.now ?? new Date().toISOString();
    const userId = randomUUID();
    this.users.insert({
      id: userId,
      login: input.login,
      name: input.name,
      passwordHash: await this.hasher.hash(input.password),
      createdAt: now,
    });
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'anonymous',
        actorId: input.login,
        action: 'owner_init',
        result: 'ok',
        reason: null,
      }),
    );
    return { userId };
  }
}
