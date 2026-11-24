import type {
  BrowserCredential,
  BrowserCredentialListResponse,
  BrowserLoginAttemptState,
  PutBrowserCredentialBody,
  SubmitBrowserLoginAttemptInput,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { BrowserCredential, BrowserLoginAttemptState, PutBrowserCredentialBody };

export type WebsiteCredentialList = BrowserCredentialListResponse;

export interface DeleteCredentialResult {
  deleted: boolean;
}

function websiteLoginsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/browser/credentials`;
}

function credentialBase(orgId: string, credentialId: string) {
  return `${websiteLoginsBase(orgId)}/${encodeURIComponent(credentialId)}`;
}

export function websiteLoginsQueryKey(orgId: string) {
  return ['orgs', orgId, 'browser', 'credentials'] as const;
}

export function getWebsiteLogins(orgId: string) {
  return apiJson<WebsiteCredentialList>(websiteLoginsBase(orgId));
}

export function websiteLoginsQuery(orgId: string) {
  return queryOptions({
    queryKey: websiteLoginsQueryKey(orgId),
    queryFn: () => getWebsiteLogins(orgId),
    enabled: Boolean(orgId),
  });
}

export function putWebsiteCredential(
  orgId: string,
  credentialId: string,
  body: PutBrowserCredentialBody,
) {
  return apiJson<BrowserCredential>(credentialBase(orgId, credentialId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteWebsiteCredential(orgId: string, credentialId: string) {
  return apiJson<DeleteCredentialResult>(credentialBase(orgId, credentialId), {
    method: 'DELETE',
  });
}

export function resetWebsiteCredentialStatus(orgId: string, credentialId: string) {
  return apiJson<BrowserCredential>(`${credentialBase(orgId, credentialId)}/reset`, {
    method: 'POST',
  });
}

export function getActiveBrowserLoginAttempt(
  orgId: string,
  credentialId: string,
  threadId: string,
) {
  return apiJson<BrowserLoginAttemptState>(
    `${credentialBase(orgId, credentialId)}/attempt?threadId=${encodeURIComponent(threadId)}`,
  );
}

export function submitBrowserLoginAttemptInput(
  orgId: string,
  credentialId: string,
  attemptId: string,
  input: SubmitBrowserLoginAttemptInput,
) {
  return apiJson<{ accepted: boolean }>(
    `${credentialBase(orgId, credentialId)}/attempt/${encodeURIComponent(attemptId)}/input`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
