import { Injectable } from '@harnesys/brix';
import { SourceKindDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type SourceKindSchema = z.infer<typeof SourceKindDescriptorSchema>;

export const HANDLERS: readonly HandlerSpec[] = [
  handlerSpec('source.list'),
  handlerSpec('source.stat'),
  handlerSpec('source.download'),
  handlerSpec('source.upload', { required: false }),
  handlerSpec('source.mkdir', { required: false }),
  handlerSpec('source.remove', { required: false }),
  handlerSpec('source.export', { required: false }),
];

export interface AddonSourceKindEntry {
  owner: OwnerKey;
  descriptor: SourceKindSchema;
}

@Injectable()
export class AddonSourceKindRegistry {
  private readonly entries = new Map<string, AddonSourceKindEntry>();

  add(owner: OwnerKey, descriptor: SourceKindSchema): void {
    this.entries.set(`${ownerKeyId(owner)}/${descriptor.id}`, { owner, descriptor });
  }

  removeOwner(owner: OwnerKey): void {
    for (const [key, entry] of this.entries) {
      if (entry.owner.orgId === owner.orgId && entry.owner.addonId === owner.addonId) {
        this.entries.delete(key);
      }
    }
  }

  find(orgId: string, addonId: string, id: string): AddonSourceKindEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId === orgId && entry.owner.addonId === addonId) {
        if (entry.descriptor.id === id) {
          return entry;
        }
      }
    }
    return undefined;
  }

  list(orgId: string): AddonSourceKindEntry[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class SourceKindFamilyModule implements FamilyModule<SourceKindSchema> {
  readonly family = 'source-kind';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
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
