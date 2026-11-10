import { Injectable } from '@harnesys/brix';
import type { ViewSection } from '@harnesys/sdk';
import { ViewDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import { AddonManifestInvalidException } from '../../../../domain/addons/errors.ts';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type ViewSchema = z.infer<typeof ViewDescriptorSchema>;

export const DEFAULT_PAGE_SECTIONS: readonly ViewSection[] = [
  { type: 'status' },
  { type: 'permissions' },
  { type: 'config' },
  { type: 'connections' },
  { type: 'automations' },
  { type: 'jobs' },
];

@Injectable()
export class AddonViewRegistry {
  private readonly sections = new Map<string, readonly ViewSection[]>();

  set(owner: OwnerKey, sections: readonly ViewSection[]): void {
    this.sections.set(ownerKeyId(owner), sections);
  }

  removeOwner(owner: OwnerKey): void {
    this.sections.delete(ownerKeyId(owner));
  }

  sectionsFor(orgId: string, addonId: string): readonly ViewSection[] {
    for (const [key, value] of this.sections.entries()) {
      if (key.startsWith(`${orgId}/${addonId}@`)) {
        return value;
      }
    }
    return DEFAULT_PAGE_SECTIONS;
  }

  has(orgId: string, addonId: string): boolean {
    for (const key of this.sections.keys()) {
      if (key.startsWith(`${orgId}/${addonId}@`)) {
        return true;
      }
    }
    return false;
  }
}

export function defaultPageSections(): readonly ViewSection[] {
  return DEFAULT_PAGE_SECTIONS;
}

@Injectable()
export class ViewFamilyModule implements FamilyModule<ViewSchema> {
  readonly family = 'view';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly registry: AddonViewRegistry) {}

  schema(_v: number): z.ZodType<ViewSchema> {
    return ViewDescriptorSchema as z.ZodType<ViewSchema>;
  }

  register(owner: OwnerKey, d: ViewSchema): Disposable {
    if (this.registry.has(owner.orgId, owner.addonId)) {
      throw new AddonManifestInvalidException([
        {
          path: `${owner.addonId}.view.${d.id}`,
          code: 'duplicate_view',
          message: `addon ${owner.addonId} already has a view contribution`,
          severity: 'error',
        },
      ]);
    }
    this.registry.set(owner, d.sections);
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }
}
