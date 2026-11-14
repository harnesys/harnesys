import type { Credentials } from '../../domain/apps/provider-module.ts';
import { SourceAccountUnavailableException } from '../../domain/source/source.error.ts';

export interface AccountTokenReader {
  access(
    orgId: string,
    accountId: string,
    opts?: { scopes?: string[] },
  ): Promise<{ credentials: Credentials }>;
}

export async function readGitToken(
  accounts: AccountTokenReader,
  orgId: string,
  accountId: string,
): Promise<string> {
  const { credentials } = await accounts.access(orgId, accountId);
  return requireCredential(credentials, 'token', orgId, accountId);
}

function requireCredential(
  credentials: Credentials,
  key: string,
  orgId: string,
  accountId: string,
): string {
  const value = credentials[key];
  if (typeof value !== 'string' || value === '') {
    throw new SourceAccountUnavailableException(orgId, accountId, `no '${key}' credential`);
  }
  return value;
}
