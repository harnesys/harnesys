import { Module } from '@harnesys/brix';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';
import { LoginAttemptStore, UserRepository } from '../../domain/identity/user-repository.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { IdentityAuditAdapter } from './identity-audit.adapter.ts';
import { MembershipRepositoryAdapter } from './membership-repository.adapter.ts';
import { PasswordHasherAdapter } from './password-hasher.adapter.ts';
import { SessionStoreAdapter } from './session-repository.adapter.ts';
import { UserInviteRepositoryAdapter } from './user-invite-repository.adapter.ts';
import { LoginAttemptStoreAdapter, UserRepositoryAdapter } from './user-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: UserRepository, useClass: UserRepositoryAdapter },
    { provide: LoginAttemptStore, useClass: LoginAttemptStoreAdapter },
    { provide: MembershipRepository, useClass: MembershipRepositoryAdapter },
    { provide: SessionStore, useClass: SessionStoreAdapter },
    { provide: UserInviteStore, useClass: UserInviteRepositoryAdapter },
    { provide: IdentityAudit, useClass: IdentityAuditAdapter },
    { provide: PasswordHasher, useClass: PasswordHasherAdapter },
  ],
  exports: [
    UserRepository,
    LoginAttemptStore,
    MembershipRepository,
    SessionStore,
    UserInviteStore,
    IdentityAudit,
    PasswordHasher,
  ],
})
export class IdentitySqliteModule {}
