import type { AddonConfigValues, AddonState } from '@harnesys/contracts';

export interface AddonStateRecord {
  readonly id: string;
  readonly orgId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly tags: readonly string[];
  readonly root: string;
  readonly entry: string;
  readonly state: AddonState;
  readonly enabledAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AddonConfigRecord {
  readonly values: AddonConfigValues;
  readonly updatedAt: string;
}

export abstract class AddonCatalogPort {
  abstract list(orgId: string): AddonStateRecord[];
  abstract find(orgId: string, addonId: string): AddonStateRecord | undefined;
  abstract upsert(record: AddonStateRecord): AddonStateRecord;
  abstract remove(orgId: string, addonId: string): void;
  abstract readConfig(orgId: string, addonId: string): AddonConfigRecord | undefined;
  abstract writeConfig(orgId: string, addonId: string, values: AddonConfigValues): void;
}
