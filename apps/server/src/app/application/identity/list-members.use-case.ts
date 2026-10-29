import { ForbiddenException, Injectable } from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';

export interface MemberView {
  userId: string;
  login: string;
  name: string;
  capabilities: string[];
  updatedAt: string;
}

export interface ListMembersInput {
  principal: Principal;
  orgId: string;
}

@Injectable()
export class ListMembersUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
  ) {}

  execute(input: ListMembersInput): MemberView[] {
    if (!authorize(input.principal, 'member.read', { orgId: input.orgId })) {
      throw new ForbiddenException('member.read capability is required');
    }
    const views: MemberView[] = [];
    for (const membership of this.memberships.listByOrg(input.orgId)) {
      const user = this.users.findById(membership.userId);
      if (!user) {
        continue;
      }
      views.push({
        userId: user.id,
        login: user.login,
        name: user.name,
        capabilities: membership.capabilities,
        updatedAt: membership.updatedAt,
      });
    }
    return views;
  }
}
