import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import { ContentDescriptorSchema, type L10n } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { AddonPackageCatalogPort } from '../../../../domain/addons/ports/addon-package-catalog.port.ts';

type ContentSchema = z.infer<typeof ContentDescriptorSchema>;
export type AddonContentKind = 'skill' | 'prompt';

export interface AddonContentEntry {
  owner: OwnerKey;
  contributionId: string;
  kind: AddonContentKind;
  title: L10n;
  path: string;
  resolvedPath: string | null;
}

@Injectable()
export class AddonContentRegistry {
  private readonly entries = new Map<string, AddonContentEntry>();

  add(owner: OwnerKey, contributionId: string, entry: AddonContentEntry): void {
    this.entries.set(`${ownerKeyId(owner)}/${contributionId}`, entry);
  }

  removeOwner(owner: OwnerKey): void {
    const prefix = `${ownerKeyId(owner)}/`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  list(orgId: string, kind?: AddonContentKind): AddonContentEntry[] {
    return [...this.entries.values()].filter(
      (entry) => entry.owner.orgId === orgId && (kind === undefined || entry.kind === kind),
    );
  }
}

@Injectable()
export class ContentFamilyModule implements FamilyModule<ContentSchema> {
  readonly family = 'content';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly registry: AddonContentRegistry,
    private readonly catalog: AddonPackageCatalogPort,
    private readonly logger: Logger,
  ) {}

  schema(_v: number): z.ZodType<ContentSchema> {
    return ContentDescriptorSchema as z.ZodType<ContentSchema>;
  }

  register(owner: OwnerKey, d: ContentSchema): Disposable {
    const resolvedPath = this.resolvePath(owner, d.path);
    this.registry.add(owner, d.id, {
      owner,
      contributionId: d.id,
      kind: d.kind,
      title: d.title,
      path: d.path,
      resolvedPath,
    });
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }

  private resolvePath(owner: OwnerKey, relativePath: string): string | null {
    const pkg = this.catalog.find(owner.addonId, owner.version);
    if (pkg === undefined) {
      this.logger.warn({ addonId: owner.addonId }, 'content path not resolved: package missing');
      return null;
    }
    const resolved = join(pkg.root, relativePath);
    if (!existsSync(resolved)) {
      this.logger.warn({ addonId: owner.addonId, path: relativePath }, 'content path missing');
      return null;
    }
    return resolved;
  }
}
