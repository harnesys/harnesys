import {
  Body,
  type BrixContext,
  Controller,
  Ctx,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Public,
  UnauthorizedException,
} from '@harnesys/brix';
import { getConnInfo } from 'hono/bun';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  type ChangePasswordInput,
  ChangePasswordUseCase,
} from '../../application/identity/change-password.use-case.ts';
import {
  type InitOwnerResult,
  InitOwnerUseCase,
} from '../../application/identity/init-owner.use-case.ts';
import {
  type IssuedNodeTicket,
  IssueNodeTicketUseCase,
} from '../../application/identity/issue-node-ticket.use-case.ts';
import {
  ListSessionsUseCase,
  type SessionView,
} from '../../application/identity/list-sessions.use-case.ts';
import { LoginUseCase } from '../../application/identity/login.use-case.ts';
import { LogoutUseCase } from '../../application/identity/logout.use-case.ts';
import {
  type OwnerStatusResult,
  OwnerStatusUseCase,
} from '../../application/identity/owner-status.use-case.ts';
import { RefreshSessionUseCase } from '../../application/identity/refresh-session.use-case.ts';
import { RevokeAllSessionsUseCase } from '../../application/identity/revoke-all-sessions.use-case.ts';
import { RevokeSessionUseCase } from '../../application/identity/revoke-session.use-case.ts';
import type { SessionTokens } from '../../application/identity/session-tokens.ts';
import {
  SessionExpiredException,
  SessionReuseException,
} from '../../domain/identity/identity.error.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import { extractBearerToken } from '../guards/worker-desk-proxy.ts';
import {
  type SessionChangePasswordBody,
  SessionChangePasswordBodySchema,
  type SessionLoginBody,
  SessionLoginBodySchema,
  type SessionOwnerInitBody,
  SessionOwnerInitBodySchema,
  type SessionRevokeBody,
  SessionRevokeBodySchema,
  type SessionTicketBody,
  SessionTicketBodySchema,
} from './session.schema.ts';

const REFRESH_COOKIE = 'harnesys.refresh';
const REFRESH_COOKIE_PATH = '/api/session';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface SessionAccessTokens {
  accessToken: string;
  accessExpiresAt: string;
}

function toAccessTokens(tokens: SessionTokens): SessionAccessTokens {
  return { accessToken: tokens.accessToken, accessExpiresAt: tokens.accessExpiresAt };
}

function isSecureRequest(ctx: BrixContext): boolean {
  return new URL(ctx.req.raw.url).protocol === 'https:';
}

function isLoopbackPeer(ctx: BrixContext): boolean {
  try {
    const address = getConnInfo(ctx).remote.address;
    return typeof address === 'string' && LOOPBACK_ADDRESSES.has(address);
  } catch {
    return false;
  }
}

function setRefreshCookie(ctx: BrixContext, value: string, expiresAt: string): void {
  setCookie(ctx, REFRESH_COOKIE, value, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: isSecureRequest(ctx),
    maxAge: Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)),
  });
}

function clearRefreshCookie(ctx: BrixContext): void {
  deleteCookie(ctx, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

function bearerOfContext(ctx: BrixContext): string {
  const token = extractBearerToken(ctx.req.raw.headers.get('Authorization'));
  if (token === null) {
    throw new UnauthorizedException('A bearer access token is required');
  }
  return token;
}

@Controller('session')
export class SessionController {
  constructor(
    private readonly sessionLogin: LoginUseCase,
    private readonly sessionRefresh: RefreshSessionUseCase,
    private readonly sessionLogout: LogoutUseCase,
    private readonly sessionTicket: IssueNodeTicketUseCase,
    private readonly sessionOwnerInit: InitOwnerUseCase,
    private readonly sessionOwnerStatus: OwnerStatusUseCase,
    private readonly sessionChangePassword: ChangePasswordUseCase,
    private readonly sessionList: ListSessionsUseCase,
    private readonly sessionRevoke: RevokeSessionUseCase,
    private readonly sessionRevokeAll: RevokeAllSessionsUseCase,
  ) {}

  @Public()
  @Get('owner/status')
  ownerStatus(): OwnerStatusResult {
    return this.sessionOwnerStatus.execute();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(SessionLoginBodySchema) body: SessionLoginBody,
    @Ctx() ctx: BrixContext,
  ): Promise<SessionAccessTokens> {
    const tokens = await this.sessionLogin.execute(body);
    setRefreshCookie(ctx, tokens.refreshToken, tokens.refreshExpiresAt);
    return toAccessTokens(tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Ctx() ctx: BrixContext): Promise<SessionAccessTokens> {
    const token = getCookie(ctx, REFRESH_COOKIE);
    if (token === undefined) {
      throw new SessionExpiredException();
    }
    let tokens: SessionTokens;
    try {
      tokens = await this.sessionRefresh.execute({ refreshToken: token });
    } catch (err) {
      if (err instanceof SessionReuseException) {
        clearRefreshCookie(ctx);
      }
      throw err;
    }
    setRefreshCookie(ctx, tokens.refreshToken, tokens.refreshExpiresAt);
    return toAccessTokens(tokens);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Ctx() ctx: BrixContext): Promise<void> {
    const token = getCookie(ctx, REFRESH_COOKIE);
    if (token !== undefined) {
      await this.sessionLogout.execute({ refreshToken: token });
    }
    clearRefreshCookie(ctx);
  }

  @Post('ticket')
  @HttpCode(200)
  async ticket(
    @SessionPrincipal() principal: Principal,
    @Body(SessionTicketBodySchema) body: SessionTicketBody,
  ): Promise<IssuedNodeTicket> {
    return await this.sessionTicket.execute({
      principal,
      orgId: principal.orgId,
      nodeId: body.nodeId,
      actions: body.actions,
    });
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @SessionPrincipal() principal: Principal,
    @Body(SessionChangePasswordBodySchema) body: SessionChangePasswordBody,
    @Ctx() ctx: BrixContext,
  ): Promise<void> {
    const input: ChangePasswordInput = {
      principal,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      currentAccessToken: bearerOfContext(ctx),
    };
    await this.sessionChangePassword.execute(input);
  }

  @Get('sessions')
  async sessions(
    @SessionPrincipal() principal: Principal,
    @Ctx() ctx: BrixContext,
  ): Promise<SessionView[]> {
    return await this.sessionList.execute({
      principal,
      currentAccessToken: bearerOfContext(ctx),
    });
  }

  @Post('revoke')
  @HttpCode(200)
  revoke(
    @SessionPrincipal() principal: Principal,
    @Body(SessionRevokeBodySchema) body: SessionRevokeBody,
  ): void {
    this.sessionRevoke.execute({ principal, familyId: body.familyId });
  }

  @Post('revoke-all')
  @HttpCode(200)
  revokeAll(@SessionPrincipal() principal: Principal): void {
    this.sessionRevokeAll.execute({ principal });
  }

  @Public()
  @Post('owner/init')
  async initOwner(
    @Body(SessionOwnerInitBodySchema) body: SessionOwnerInitBody,
    @Ctx() ctx: BrixContext,
  ): Promise<InitOwnerResult> {
    if (!isLoopbackPeer(ctx)) {
      throw new ForbiddenException('Owner init is loopback-only');
    }
    return await this.sessionOwnerInit.execute(body);
  }
}
