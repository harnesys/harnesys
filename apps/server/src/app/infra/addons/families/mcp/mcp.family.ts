import { Injectable } from '@harnesys/brix';
import { McpDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type McpSchema = z.infer<typeof McpDescriptorSchema>;

export interface AddonMcpEntry {
  owner: OwnerKey;
  descriptor: McpSchema;
}

@Injectable()
export class AddonMcpRegistry {
  private readonly entries = new Map<string, AddonMcpEntry>();

  add(owner: OwnerKey, descriptor: McpSchema): void {
    this.entries.set(ownerKeyId(owner), { owner, descriptor });
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  list(orgId: string): AddonMcpEntry[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class McpFamilyModule implements FamilyModule<McpSchema> {
  readonly family = 'mcp';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly registry: AddonMcpRegistry) {}

  schema(_v: number): z.ZodType<McpSchema> {
    return McpDescriptorSchema as z.ZodType<McpSchema>;
  }

  register(owner: OwnerKey, d: McpSchema): Disposable {
    this.registry.add(owner, d);
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }
}
