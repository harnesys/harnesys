import { Injectable } from '@harnesys/brix';
import { UserInviteInvalidException } from '../../domain/identity/identity.error.ts';
import { UserInviteStore } from '../../domain/identity/user-invite-repository.port.ts';
import { hashToken } from './hash-token.ts';

export interface PreviewUserInviteInput {
  code: string;
  now?: string;
}

export interface UserInvitePreview {
  orgId: string;
  capabilities: string[];
  expiresAt: string;
}

@Injectable()
export class PreviewUserInviteUseCase {
  constructor(private readonly invites: UserInviteStore) {}

  async execute(input: PreviewUserInviteInput): Promise<UserInvitePreview> {
    const invite = this.invites.findByCodeHash(await hashToken(input.code));
    const nowMs = Date.parse(input.now ?? new Date().toISOString());
    if (!invite || invite.usedAt !== null || Date.parse(invite.expiresAt) <= nowMs) {
      throw new UserInviteInvalidException();
    }
    return {
      orgId: invite.orgId,
      capabilities: invite.capabilities,
      expiresAt: invite.expiresAt,
    };
  }
}
