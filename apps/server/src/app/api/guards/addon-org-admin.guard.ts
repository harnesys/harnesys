import {
  CanActivate,
  ForbiddenException,
  type GuardContext,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import { authorize } from '../../domain/identity/authorize.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { PRINCIPAL_CONTEXT_KEY } from './session.guard.ts';

const ORG_PATH_PATTERN = /\/orgs\/([^/]+)/;

function orgIdOf(ctx: GuardContext): string | null {
  const match = ORG_PATH_PATTERN.exec(new URL(ctx.request.url).pathname);
  return match?.[1] ?? null;
}

/**
 * Mutating org-scoped addon actions require the org admin role: the
 * `org.update` capability covers owner and admin role presets.
 */
@Injectable()
export class AddonOrgAdminGuard extends CanActivate {
  canActivate(ctx: GuardContext): boolean {
    const principal = ctx.get<Principal>(PRINCIPAL_CONTEXT_KEY);
    if (principal?.kind !== 'user') {
      throw new UnauthorizedException('No session principal resolved');
    }
    const orgId = orgIdOf(ctx);
    if (!orgId || !authorize(principal, 'org.update', { orgId })) {
      throw new ForbiddenException('Organization admin role required');
    }
    return true;
  }
}
