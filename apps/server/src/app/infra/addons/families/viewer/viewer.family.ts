import { Injectable } from '@harnesys/brix';
import type { L10n, Violation } from '@harnesys/sdk';
import { ViewerDescriptorSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import { AddonManifestInvalidException } from '../../../../domain/addons/errors.ts';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';

type ViewerSchema = z.infer<typeof ViewerDescriptorSchema>;

export type ViewerMode = 'view' | 'edit';

export interface AddonViewerEntry {
  owner: OwnerKey;
  viewerId: string;
  title: L10n;
  extensions: readonly string[];
  route: string;
  mode: ViewerMode;
  create: boolean;
}

@Injectable()
export class AddonViewerTable {
  private readonly entries = new Map<string, AddonViewerEntry>();

  register(owner: OwnerKey, d: ViewerSchema): Disposable {
    const key = `${ownerKeyId(owner)}/${d.id}`;
    this.entries.set(key, {
      owner,
      viewerId: d.id,
      title: d.title,
      extensions: [...d.extensions],
      route: d.route,
      mode: d.mode,
      create: d.create === true,
    });
    return {
      dispose: () => {
        this.entries.delete(key);
      },
    };
  }

  removeOwner(owner: OwnerKey): void {
    const prefix = `${ownerKeyId(owner)}/`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  list(orgId: string): AddonViewerEntry[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class ViewerFamilyModule implements FamilyModule<ViewerSchema> {
  readonly family = 'viewer';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly table: AddonViewerTable) {}

  schema(_v: number): z.ZodType<ViewerSchema> {
    return ViewerDescriptorSchema as z.ZodType<ViewerSchema>;
  }

  register(owner: OwnerKey, d: ViewerSchema): Disposable {
    const taken = this.table
      .list(owner.orgId)
      .find((entry) => entry.extensions.some((ext) => d.extensions.includes(ext)));
    if (taken) {
      throw new AddonManifestInvalidException([
        {
          path: `${owner.addonId}.viewer.${d.id}`,
          code: 'viewer_extension_conflict',
          message: `extension(s) ${d.extensions.join(', ')} already handled by ${taken.owner.addonId}/${taken.viewerId}`,
          severity: 'error',
        },
      ] satisfies readonly Violation[]);
    }
    return this.table.register(owner, d);
  }
}
