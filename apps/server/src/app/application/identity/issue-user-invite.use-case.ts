import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, ValidationException } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';
import { areKnownCapabilities } from './capability-filter.ts';
import { hashToken } from './hash-token.ts';
import { identityAuditRow } from './identity-audit-row.ts';
import { mintOpaqueToken } from './mint-token.ts';

const USER_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssueUserInviteInput {
  principal: Principal;
  orgId: string;
  capabilities: string[];
  now?: string;
}

export interface IssuedUserInvite {
  inviteId: string;
  code: string;
}

@Injectable()
export class IssueUserInviteUseCase {
  constructor(
    private readonly invites: UserInviteStore,
    private readonly audit: IdentityAudit,
  ) {}

  async execute(input: IssueUserInviteInput): Promise<IssuedUserInvite> {
    if (!authorize(input.principal, 'member.invite', { orgId: input.orgId })) {
      throw new ForbiddenException('member.invite capability is required');
    }
    if (!areKnownCapabilities(input.capabilities)) {
      throw new ValidationException('capabilities must be non-empty known capability strings');
    }
    const now = input.now ?? new Date().toISOString();
    const code = mintOpaqueToken();
    const inviteId = randomUUID();
    this.invites.insert({
      id: inviteId,
      orgId: input.orgId,
      codeHash: await hashToken(code),
      capabilities: input.capabilities,
      expiresAt: new Date(Date.parse(now) + USER_INVITE_TTL_MS).toISOString(),
      createdBy: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
    });
    this.audit.append(
      identityAuditRow(now, {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        action: 'invite_issued',
        result: 'ok',
        reason: inviteId,
      }),
    );
    return { inviteId, code };
  }
}
