import {
  CanActivate,
  createParamDecorator,
  type GuardContext,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import { hashToken } from '../../application/identity/hash-token.ts';
import { SessionExpiredException } from '../../domain/identity/identity.error.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { type SessionRecord, SessionStore } from '../../domain/identity/session-store.port.ts';
import { extractBearerToken, orgIdFromRequest } from './worker-desk-proxy.ts';

export const PRINCIPAL_CONTEXT_KEY = 'identity:principal';
export const TICKET_HEADER_NAME = 'X-Harnesys-Ticket';

interface TicketRoutePattern {
  method: string;
  pattern: RegExp;
}

const LOCAL_OPS_TICKET_ROUTES: readonly TicketRoutePattern[] = [
  { method: 'POST', pattern: /^\/api\/orgs\/[^/]+\/browse-dirs$/ },
  { method: 'POST', pattern: /^\/api\/host\/system-skills\/[^/]+\/restore$/ },
  { method: 'POST', pattern: /^\/api\/orgs\/[^/]+\/sources$/ },
  { method: 'POST', pattern: /^\/api\/orgs\/[^/]+\/sources\/[^/]+\/prepare$/ },
];

export function isLocalOpsTicketRoute(pathname: string, method: string): boolean {
  return LOCAL_OPS_TICKET_ROUTES.some(
    (route) => route.method === method && route.pattern.test(pathname),
  );
}

export function hasTicketCredential(request: Request): boolean {
  const url = new URL(request.url);
  return request.headers.has(TICKET_HEADER_NAME) || url.searchParams.has('ticket');
}

export const SessionPrincipal = createParamDecorator((_data, paramContext) => {
  const stored = paramContext.context.get(PRINCIPAL_CONTEXT_KEY);
  if (!isUserPrincipal(stored)) {
    throw new UnauthorizedException('No session principal resolved');
  }
  return stored;
});

@Injectable()
export class SessionGuard extends CanActivate {
  constructor(
    private readonly sessions: SessionStore,
    private readonly memberships: MembershipRepository,
  ) {
    super();
  }

  async canActivate(ctx: GuardContext): Promise<boolean> {
    const accessToken = extractBearerToken(ctx.request.headers.get('Authorization'));
    if (!accessToken) {
      const url = new URL(ctx.request.url);
      if (
        isLocalOpsTicketRoute(url.pathname, ctx.request.method) &&
        hasTicketCredential(ctx.request)
      ) {
        return true;
      }
      throw new SessionExpiredException();
    }
    const session = this.sessions.findByAccessHash(await hashToken(accessToken));
    if (!isAlive(session)) {
      throw new SessionExpiredException();
    }
    const orgId =
      orgIdFromRequest(new URL(ctx.request.url), ctx.request.headers.get('X-Org-Id')) ?? '';
    const membership = orgId ? this.memberships.findByUserAndOrg(session.userId, orgId) : null;
    const principal: Principal = {
      kind: 'user',
      userId: session.userId,
      orgId,
      capabilities: membership ? [...membership.capabilities] : [],
    };
    ctx.set(PRINCIPAL_CONTEXT_KEY, principal);
    return true;
  }
}

function isUserPrincipal(value: unknown): value is Principal {
  return (
    typeof value === 'object' && value !== null && (value as Partial<Principal>).kind === 'user'
  );
}

function isAlive(session: SessionRecord | null): session is SessionRecord {
  if (!session || session.revokedAt) {
    return false;
  }
  const nowMs = Date.now();
  return Date.parse(session.expiresAt) >= nowMs && Date.parse(session.absoluteExpiresAt) >= nowMs;
}
