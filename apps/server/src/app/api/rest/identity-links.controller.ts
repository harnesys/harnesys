import { Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post } from '@harnesys/brix';
import type { IssueIdentityLinkCodeResponse, ListIdentityLinksResponse } from '@harnesys/contracts';
import { IdentityProviderSchema } from '@harnesys/contracts';
import { CreateIdentityLinkCodeUseCase } from '../../application/identity/create-identity-link-code.use-case.ts';
import { ListIdentityLinksUseCase } from '../../application/identity/list-identity-links.use-case.ts';
import { UnlinkIdentityUseCase } from '../../application/identity/unlink-identity.use-case.ts';
import type { Principal, UserPrincipal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('identity/links')
export class IdentityLinksController {
  constructor(
    private readonly listLinks: ListIdentityLinksUseCase,
    private readonly createCode: CreateIdentityLinkCodeUseCase,
    private readonly unlinkIdentity: UnlinkIdentityUseCase,
  ) {}

  @Get()
  list(@SessionPrincipal() principal: Principal): ListIdentityLinksResponse {
    return this.listLinks.execute({ userId: userOf(principal).userId });
  }

  @Post(':provider/code')
  @HttpCode(201)
  issueCode(
    @SessionPrincipal() principal: Principal,
    @Param('provider') provider: string,
  ): IssueIdentityLinkCodeResponse {
    return this.createCode.execute({
      userId: userOf(principal).userId,
      provider: IdentityProviderSchema.parse(provider),
    });
  }

  @Delete(':provider')
  @HttpCode(204)
  unlink(@SessionPrincipal() principal: Principal, @Param('provider') provider: string): void {
    this.unlinkIdentity.execute({
      userId: userOf(principal).userId,
      provider: IdentityProviderSchema.parse(provider),
    });
  }
}

function userOf(principal: Principal): UserPrincipal {
  if (principal.kind !== 'user') {
    throw new ForbiddenException('user principal required');
  }
  return principal;
}
