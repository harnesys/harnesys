import {
  CanActivate,
  ForbiddenException,
  type GuardContext,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import type { Principal } from '../../domain/identity/principal.ts';
import { PRINCIPAL_CONTEXT_KEY } from './session.guard.ts';

/**
 * Host-wide addon administration (package install, host policy). There is no
 * dedicated HostAdminGuard in the codebase yet; `host.promote` is the closest
 * existing host-level capability and is held by owner role presets.
 */
@Injectable()
export class AddonHostAdminGuard extends CanActivate {
  canActivate(ctx: GuardContext): boolean {
    const principal = ctx.get<Principal>(PRINCIPAL_CONTEXT_KEY);
    if (principal?.kind !== 'user') {
      throw new UnauthorizedException('No session principal resolved');
    }
    if (!principal.capabilities.includes('host.promote')) {
      throw new ForbiddenException('Host admin role required');
    }
    return true;
  }
}
