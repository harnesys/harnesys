import type {
  IdentityProvider,
  IssueIdentityLinkCodeResponse,
  ListIdentityLinksResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export const identityLinksQueryKey = ['identity', 'links'] as const;

function identityLinkPath(provider: IdentityProvider): string {
  return `/api/identity/links/${encodeURIComponent(provider)}`;
}

export function listIdentityLinks() {
  return apiJson<ListIdentityLinksResponse>('/api/identity/links');
}

export function identityLinksQuery() {
  return queryOptions({
    queryKey: identityLinksQueryKey,
    queryFn: listIdentityLinks,
    refetchOnWindowFocus: true,
  });
}

export function issueIdentityLinkCode(provider: IdentityProvider) {
  return apiJson<IssueIdentityLinkCodeResponse>(`${identityLinkPath(provider)}/code`, {
    method: 'POST',
  });
}

export function unlinkIdentity(provider: IdentityProvider) {
  return apiJson<void>(identityLinkPath(provider), {
    method: 'DELETE',
  });
}
