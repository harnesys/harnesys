import { Injectable } from '@harnesys/brix';
import { IDENTITY_LINK_CODE_TTL_MS, type IssueIdentityLinkCodeResponse } from '@harnesys/contracts';
import { IdentityLinkRepository } from '../../domain/identity/identity-link.port.ts';
import { createOneTimeCode } from '../../domain/one-time-code.ts';

export interface CreateIdentityLinkCodeRequest {
  userId: string;
  provider: string;
}

@Injectable()
export class CreateIdentityLinkCodeUseCase {
  constructor(private readonly links: IdentityLinkRepository) {}

  execute(request: CreateIdentityLinkCodeRequest): IssueIdentityLinkCodeResponse {
    const { code, hash } = createOneTimeCode();
    const now = Date.now();
    const expiresAt = new Date(now + IDENTITY_LINK_CODE_TTL_MS).toISOString();
    this.links.issueCode({
      userId: request.userId,
      provider: request.provider,
      codeHash: hash,
      expiresAt,
      at: new Date(now).toISOString(),
    });
    return { code, expiresAt };
  }
}
