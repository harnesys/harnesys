import { Injectable } from '@harnesys/brix';
import {
  IdentityLinkCodeInvalidException,
  UserNotFoundException,
} from '../../domain/identity/identity.error.ts';
import { IdentityLinkRepository } from '../../domain/identity/identity-link.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { hashOneTimeCode } from '../../domain/one-time-code.ts';

export interface ConfirmIdentityLinkRequest {
  provider: string;
  providerUserId: string;
  code: string;
  providerDisplayName?: string | null;
  providerHandle?: string | null;
}

export interface ConfirmedIdentityLink {
  userId: string;
  name: string;
}

@Injectable()
export class ConfirmIdentityLinkUseCase {
  constructor(
    private readonly links: IdentityLinkRepository,
    private readonly users: UserRepository,
  ) {}

  execute(request: ConfirmIdentityLinkRequest): ConfirmedIdentityLink {
    const code = request.code.trim().toUpperCase();
    if (code.length === 0) {
      throw new IdentityLinkCodeInvalidException();
    }
    const at = new Date().toISOString();
    const consumed = this.links.consumeCode({
      provider: request.provider,
      codeHash: hashOneTimeCode(code),
      at,
    });
    if (!consumed) {
      throw new IdentityLinkCodeInvalidException();
    }
    const link = this.links.link({
      userId: consumed.userId,
      provider: request.provider,
      providerUserId: request.providerUserId,
      displayName: request.providerDisplayName ?? null,
      handle: request.providerHandle ?? null,
      at,
    });
    const user = this.users.findById(link.userId);
    if (!user) {
      throw new UserNotFoundException(link.userId);
    }
    return { userId: user.id, name: user.name };
  }
}
