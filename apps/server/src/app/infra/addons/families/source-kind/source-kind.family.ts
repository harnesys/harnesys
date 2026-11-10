import { Injectable } from '@harnesys/brix';
import { SourceKindDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type SourceKindSchema = z.infer<typeof SourceKindDescriptorSchema>;

export interface AddonSourceKindEntry {
  owner: OwnerKey;
  descriptor: SourceKindSchema;
}

@Injectable()
export class AddonSourceKindRegistry {
  private readonly entries = new Map<string, AddonSourceKindEntry>();

  add(owner: OwnerKey, descriptor: SourceKindSchema): void {
    this.entries.set(ownerKeyId(owner), { owner, descriptor });
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  list(orgId: string): AddonSourceKindEntry[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class SourceKindFamilyModule implements FamilyModule<SourceKindSchema> {
  readonly family = 'source-kind';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly registry: AddonSourceKindRegistry) {}

  schema(_v: number): z.ZodType<SourceKindSchema> {
    return SourceKindDescriptorSchema as z.ZodType<SourceKindSchema>;
  }

  register(owner: OwnerKey, d: SourceKindSchema): Disposable {
    this.registry.add(owner, d);
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }
}
