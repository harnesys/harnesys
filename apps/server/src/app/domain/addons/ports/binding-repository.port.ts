export interface AddonBindingRow {
  orgId: string;
  addonId: string;
  connectionId: string;
  accountId: string;
  createdAt: string;
}

export abstract class BindingRepositoryPort {
  abstract list(orgId: string, addonId?: string): AddonBindingRow[];

  abstract accountsFor(orgId: string, addonId: string, connectionId: string): AddonBindingRow[];

  abstract byAccount(orgId: string, accountId: string): AddonBindingRow[];

  abstract add(row: AddonBindingRow): void;

  abstract remove(orgId: string, addonId: string, connectionId: string, accountId: string): void;

  abstract setBindings(
    orgId: string,
    addonId: string,
    connectionId: string,
    accountIds: readonly string[],
  ): void;

  abstract removeAddon(orgId: string, addonId: string): void;
}
