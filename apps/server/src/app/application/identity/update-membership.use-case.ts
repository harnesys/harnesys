import {
  EntityNotFoundException,
  ForbiddenException,
  Injectable,
  ValidationException,
} from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import {
  type MembershipRecord,
  MembershipRepository,
} from '../../domain/identity/membership-repository.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { areKnownCapabilities } from './capability-filter.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface UpdateMembershipInput {
  principal: Principal;
  orgId: string;
  userId: string;
  capabilities: string[];
  now?: string;
}

@Injectable()
export class UpdateMembershipUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: UpdateMembershipInput): MembershipRecord {
    if (!authorize(input.principal, 'member.manage', { orgId: input.orgId })) {
      throw new ForbiddenException('member.manage capability is required');
    }
    if (!areKnownCapabilities(input.capabilities)) {
      throw new ValidationException('capabilities must be non-empty known capability strings');
    }
    const membership = this.memberships.findByUserAndOrg(input.userId, input.orgId);
    if (!membership) {
      throw new EntityNotFoundException(`Membership not found: ${input.userId}`);
    }
    const now = input.now ?? new Date().toISOString();
    this.memberships.upsert({
      userId: input.userId,
      orgId: input.orgId,
      capabilities: input.capabilities,
      updatedAt: now,
    });
    this.audit.append(
      identityAuditRow(now, {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        action: 'member_updated',
        result: 'ok',
        reason: input.userId,
      }),
    );
    return {
      userId: input.userId,
      orgId: input.orgId,
      capabilities: input.capabilities,
      updatedAt: now,
    };
  }
}
