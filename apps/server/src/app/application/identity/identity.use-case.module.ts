import { Module } from '@harnesys/brix';
import { AcceptUserInviteUseCase } from './accept-user-invite.use-case.ts';
import { ChangePasswordUseCase } from './change-password.use-case.ts';
import { ConfirmIdentityLinkUseCase } from './confirm-identity-link.use-case.ts';
import { CreateIdentityLinkCodeUseCase } from './create-identity-link-code.use-case.ts';
import { InitOwnerUseCase } from './init-owner.use-case.ts';
import { IssueNodeTicketUseCase } from './issue-node-ticket.use-case.ts';
import { IssueUserInviteUseCase } from './issue-user-invite.use-case.ts';
import { ListIdentityLinksUseCase } from './list-identity-links.use-case.ts';
import { ListMembersUseCase } from './list-members.use-case.ts';
import { ListOrgAuditUseCase } from './list-org-audit.use-case.ts';
import { ListSessionsUseCase } from './list-sessions.use-case.ts';
import { LoginUseCase } from './login.use-case.ts';
import { LogoutUseCase } from './logout.use-case.ts';
import { OwnerStatusUseCase } from './owner-status.use-case.ts';
import { RefreshSessionUseCase } from './refresh-session.use-case.ts';
import { RemoveMembershipUseCase } from './remove-membership.use-case.ts';
import { ResetMemberPasswordUseCase } from './reset-member-password.use-case.ts';
import { RevokeAllSessionsUseCase } from './revoke-all-sessions.use-case.ts';
import { RevokeSessionUseCase } from './revoke-session.use-case.ts';
import { UnlinkIdentityUseCase } from './unlink-identity.use-case.ts';
import { UpdateMembershipUseCase } from './update-membership.use-case.ts';

const IDENTITY_USE_CASES = [
  LoginUseCase,
  RefreshSessionUseCase,
  LogoutUseCase,
  ChangePasswordUseCase,
  ListSessionsUseCase,
  RevokeSessionUseCase,
  RevokeAllSessionsUseCase,
  OwnerStatusUseCase,
  InitOwnerUseCase,
  IssueUserInviteUseCase,
  AcceptUserInviteUseCase,
  ListMembersUseCase,
  ListOrgAuditUseCase,
  UpdateMembershipUseCase,
  RemoveMembershipUseCase,
  ResetMemberPasswordUseCase,
  IssueNodeTicketUseCase,
  CreateIdentityLinkCodeUseCase,
  ConfirmIdentityLinkUseCase,
  ListIdentityLinksUseCase,
  UnlinkIdentityUseCase,
];

@Module({
  providers: [...IDENTITY_USE_CASES],
  exports: [...IDENTITY_USE_CASES],
})
export class IdentityUseCaseModule {}
