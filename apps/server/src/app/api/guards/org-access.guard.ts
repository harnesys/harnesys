import {
  CanActivate,
  ForbiddenException,
  type GuardContext,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import { OrgIdRequiredException } from '../../domain/fleet/fleet.error.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { PRINCIPAL_CONTEXT_KEY } from './session.guard.ts';
import { orgIdFromRequest } from './worker-desk-proxy.ts';

@Injectable()
export class OrgAccessGuard extends CanActivate {
  constructor(private readonly memberships: MembershipRepository) {
    super();
  }

  canActivate(ctx: GuardContext): boolean {
    const principal = ctx.get<Principal>(PRINCIPAL_CONTEXT_KEY);
    if (principal?.kind !== 'user') {
      throw new UnauthorizedException('No session principal resolved');
    }
    const orgId = orgIdFromRequest(new URL(ctx.request.url), ctx.request.headers.get('X-Org-Id'));
    if (!orgId) {
      throw new OrgIdRequiredException();
    }
    if (!this.memberships.findByUserAndOrg(principal.userId, orgId)) {
      throw new ForbiddenException('No membership for the requested organization');
    }
    return true;
  }
}
