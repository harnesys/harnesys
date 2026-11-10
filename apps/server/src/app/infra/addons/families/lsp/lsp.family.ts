import { Injectable } from '@harnesys/brix';
import { LspDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type LspSchema = z.infer<typeof LspDescriptorSchema>;

export interface AddonLspEntry {
  owner: OwnerKey;
  descriptor: LspSchema;
}

@Injectable()
export class AddonLspRegistry {
  private readonly entries = new Map<string, AddonLspEntry>();

  add(owner: OwnerKey, descriptor: LspSchema): void {
    this.entries.set(ownerKeyId(owner), { owner, descriptor });
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  list(orgId: string): AddonLspEntry[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class LspFamilyModule implements FamilyModule<LspSchema> {
  readonly family = 'lsp';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly registry: AddonLspRegistry) {}

  schema(_v: number): z.ZodType<LspSchema> {
    return LspDescriptorSchema as z.ZodType<LspSchema>;
  }

  register(owner: OwnerKey, d: LspSchema): Disposable {
    this.registry.add(owner, d);
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }
}
