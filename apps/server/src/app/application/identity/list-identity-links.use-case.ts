import { Injectable } from '@harnesys/brix';
import type { IdentityLink, ListIdentityLinksResponse } from '@harnesys/contracts';
import {
  type IdentityLinkRecord,
  IdentityLinkRepository,
} from '../../domain/identity/identity-link.port.ts';

export interface ListIdentityLinksRequest {
  userId: string;
}

@Injectable()
export class ListIdentityLinksUseCase {
  constructor(private readonly links: IdentityLinkRepository) {}

  execute(request: ListIdentityLinksRequest): ListIdentityLinksResponse {
    return { links: this.links.listByUser(request.userId).map(toIdentityLink) };
  }
}

function toIdentityLink(record: IdentityLinkRecord): IdentityLink {
  return {
    provider: record.provider,
    providerUserId: record.providerUserId,
    displayName: record.displayName,
    handle: record.handle,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
