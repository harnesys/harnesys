import type { AddonManifest, JsonObject } from '@harnesys/sdk';
import type { OwnerKey } from '../owner.ts';

export interface ContributionRecord {
  owner: OwnerKey;
  contributionId: string;
  family: string;
  descriptor: JsonObject;
}

export type ContributionChangeKind = 'activated' | 'deactivated' | 'swapped';

export interface ContributionChange {
  kind: ContributionChangeKind;
  orgId: string;
  family: string;
  addonId: string;
}

export type ContributionChangeHandler = (change: ContributionChange) => void;

export abstract class ContributionRegistryPort {
  abstract activate(owner: OwnerKey, manifest: AddonManifest): void;

  abstract deactivate(owner: OwnerKey): void;

  abstract swap(oldOwner: OwnerKey, newOwner: OwnerKey, manifest: AddonManifest): void;

  /** Whether this exact owner version is currently registered (§8.2 boot walk). */
  isActive(_owner: OwnerKey): boolean {
    return false;
  }

  abstract contributions(orgId: string, family: string): readonly ContributionRecord[];

  abstract onChange(orgId: string, family: string, handler: ContributionChangeHandler): () => void;
}
