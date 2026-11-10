import type { AddonManifest, Contribution, JsonObject } from '@harnesys/sdk';
import { AddonIncompatibleException, AddonManifestInvalidException } from './errors.ts';
import type { FamilyModule } from './family-module.ts';
import type { Disposable, OwnerKey } from './owner.ts';
import { ownerKeyEquals, ownerKeyId } from './owner.ts';
import type {
  ContributionChange,
  ContributionChangeHandler,
  ContributionChangeKind,
  ContributionRecord,
  ContributionRegistryPort,
} from './ports/contribution-registry.port.ts';

interface FamilyRegistration {
  family: string;
  contributionId: string;
  dispose: Disposable;
}

interface OwnerRegistration {
  owner: OwnerKey;
  manifest: AddonManifest;
  families: FamilyRegistration[];
}

export class ContributionRegistry implements ContributionRegistryPort {
  private readonly modules: ReadonlyMap<string, FamilyModule>;

  private readonly registrations = new Map<string, OwnerRegistration>();

  private readonly changeHandlers = new Map<string, Map<string, Set<ContributionChangeHandler>>>();

  constructor(familyModules: readonly FamilyModule[]) {
    this.modules = new Map(familyModules.map((module) => [module.family, module]));
  }

  isActive(owner: OwnerKey): boolean {
    return this.registrations.has(ownerKeyId(owner));
  }

  activate(owner: OwnerKey, manifest: AddonManifest): void {
    const key = ownerKeyId(owner);
    if (this.registrations.has(key)) {
      throw new AddonManifestInvalidException([
        {
          path: 'id',
          code: 'already_active',
          message: `Addon already active: ${key}`,
          severity: 'error',
        },
      ]);
    }
    const registration: OwnerRegistration = { owner, manifest, families: [] };
    try {
      for (const contribution of manifest.contributions) {
        this.registerContribution(registration, contribution);
      }
    } catch (error) {
      this.disposeReverse(registration);
      throw error;
    }
    this.registrations.set(key, registration);
    this.fireFamilies(registration, 'activated');
  }

  deactivate(owner: OwnerKey): void {
    const key = ownerKeyId(owner);
    const registration = this.registrations.get(key);
    if (!registration) {
      return;
    }
    const families = [...registration.families];
    this.disposeReverse(registration);
    this.registrations.delete(key);
    for (const family of new Set(families.map((entry) => entry.family))) {
      this.fireChange({ kind: 'deactivated', orgId: owner.orgId, family, addonId: owner.addonId });
    }
  }

  swap(oldOwner: OwnerKey, newOwner: OwnerKey, manifest: AddonManifest): void {
    if (ownerKeyEquals(oldOwner, newOwner)) {
      throw new AddonManifestInvalidException([
        {
          path: 'version',
          code: 'swap_same_owner',
          message: 'Swap requires a different OwnerKey version',
          severity: 'error',
        },
      ]);
    }
    this.activate(newOwner, manifest);
    this.deactivate(oldOwner);
    const families = new Set(manifest.contributions.map((entry) => entry.family));
    for (const family of families) {
      this.fireChange({
        kind: 'swapped',
        orgId: newOwner.orgId,
        family,
        addonId: newOwner.addonId,
      });
    }
  }

  contributions(orgId: string, family: string): readonly ContributionRecord[] {
    const records: ContributionRecord[] = [];
    for (const registration of this.registrations.values()) {
      if (registration.owner.orgId !== orgId) {
        continue;
      }
      for (const contribution of registration.manifest.contributions) {
        const registered = registration.families.some(
          (entry) => entry.family === family && entry.contributionId === contribution.id,
        );
        if (contribution.family === family && registered) {
          records.push({
            owner: registration.owner,
            contributionId: contribution.id,
            family,
            descriptor: contribution.descriptor as JsonObject,
          });
        }
      }
    }
    return records;
  }

  onChange(orgId: string, family: string, handler: ContributionChangeHandler): () => void {
    const byFamily =
      this.changeHandlers.get(orgId) ?? new Map<string, Set<ContributionChangeHandler>>();
    const handlers = byFamily.get(family) ?? new Set<ContributionChangeHandler>();
    handlers.add(handler);
    byFamily.set(family, handlers);
    this.changeHandlers.set(orgId, byFamily);
    return () => {
      handlers.delete(handler);
    };
  }

  private registerContribution(registration: OwnerRegistration, contribution: Contribution): void {
    const module = this.modules.get(contribution.family);
    if (!module) {
      if (contribution.optional) {
        return;
      }
      throw new AddonIncompatibleException([
        `family_unknown:${contribution.family}/${contribution.id}`,
      ]);
    }
    const v = contribution.v ?? 1;
    if (!module.versions.includes(v)) {
      if (contribution.optional) {
        return;
      }
      throw new AddonIncompatibleException([
        `descriptor_version_unsupported:${contribution.family}/${contribution.id}@${String(v)}`,
      ]);
    }
    const parsed = module.schema(v).safeParse(contribution.descriptor);
    if (!parsed.success) {
      throw new AddonManifestInvalidException(
        parsed.error.issues.map((issue) => ({
          path: `${contribution.id}.${issue.path.join('.')}`,
          code: 'descriptor_invalid',
          message: issue.message,
          severity: 'error' as const,
        })),
      );
    }
    const descriptor = parsed.data as JsonObject;
    if (module.crossCheck) {
      const errors = module
        .crossCheck(descriptor, registration.manifest)
        .filter((violation) => violation.severity === 'error');
      if (errors.length > 0) {
        throw new AddonManifestInvalidException(errors);
      }
    }
    const dispose = module.register(registration.owner, descriptor);
    registration.families.push({
      family: contribution.family,
      contributionId: contribution.id,
      dispose,
    });
  }

  private disposeReverse(registration: OwnerRegistration): void {
    for (let index = registration.families.length - 1; index >= 0; index -= 1) {
      registration.families[index]?.dispose.dispose();
    }
    registration.families.length = 0;
  }

  private fireFamilies(registration: OwnerRegistration, kind: ContributionChangeKind): void {
    for (const family of new Set(registration.families.map((entry) => entry.family))) {
      this.fireChange({
        kind,
        orgId: registration.owner.orgId,
        family,
        addonId: registration.owner.addonId,
      });
    }
  }

  private fireChange(change: ContributionChange): void {
    const byFamily = this.changeHandlers.get(change.orgId);
    if (!byFamily) {
      return;
    }
    const handlers = byFamily.get(change.family);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(change);
    }
  }
}
