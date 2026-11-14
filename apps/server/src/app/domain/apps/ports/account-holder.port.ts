import type { AccountHolderRef } from '../errors.ts';

export abstract class AccountHolderPort {
  abstract register(
    holderType: string,
    lookup: (orgId: string, accountId: string) => Promise<AccountHolderRef[]>,
  ): () => void;
  abstract holders(orgId: string, accountId: string): Promise<AccountHolderRef[]>;
}
