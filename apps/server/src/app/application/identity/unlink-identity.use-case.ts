import { Injectable } from '@harnesys/brix';
import { IdentityLinkRepository } from '../../domain/identity/identity-link.port.ts';

export interface UnlinkIdentityRequest {
  userId: string;
  provider: string;
}

@Injectable()
export class UnlinkIdentityUseCase {
  constructor(private readonly links: IdentityLinkRepository) {}

  execute(request: UnlinkIdentityRequest): void {
    this.links.unlink(request.userId, request.provider);
  }
}
