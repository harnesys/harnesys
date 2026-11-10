export interface AddonTransportBindingRow {
  orgId: string;
  addonId: string;
  provider: string;
  externalChatId: string;
  threadId: string;
  createdAt: string;
}

export abstract class AddonTransportBindingRepositoryPort {
  abstract find(
    orgId: string,
    addonId: string,
    provider: string,
    externalChatId: string,
  ): AddonTransportBindingRow | null;

  abstract add(row: AddonTransportBindingRow): void;

  abstract remove(orgId: string, addonId: string, provider: string, externalChatId: string): void;

  abstract removeAddon(orgId: string, addonId: string): void;
}
