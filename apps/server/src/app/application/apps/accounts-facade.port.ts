import type { AccountErrorCode, ProviderError } from '../../domain/apps/errors.ts';
import type { AccountEvent } from '../../domain/apps/ports/account-event.port.ts';
import type { AppCredentials, Credentials } from '../../domain/apps/provider-module.ts';
import type { AccountView } from '../../domain/apps/records.ts';

export interface AccountFindQuery {
  kind?: string;
  appId?: string;
  scopes?: string[];
  connectedOnly?: boolean;
}

export abstract class AccountsFacadePort {
  abstract find(orgId: string, query: AccountFindQuery): Promise<AccountView[]>;
  abstract get(orgId: string, accountId: string): Promise<AccountView | null>;
  abstract access(
    orgId: string,
    accountId: string,
    opts?: { scopes?: string[] },
  ): Promise<{ credentials: Credentials; expiresAt: number | null; app?: AppCredentials | null }>;
  abstract report(orgId: string, accountId: string, code: AccountErrorCode): Promise<void>;
  abstract subscribe(orgId: string, handler: (event: AccountEvent) => void): () => void;
}

export type { ProviderError };
