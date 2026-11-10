import { Injectable } from '@harnesys/brix';
import { RouteDescriptorSchema, type RouteMethod } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { matchRoutePattern } from './route-pattern.ts';

type RouteSchema = z.infer<typeof RouteDescriptorSchema>;

export interface AddonRouteEntry {
  owner: OwnerKey;
  routeId: string;
  method: RouteMethod;
  path: string;
  role: 'member' | 'admin';
  exposure: 'org' | 'public';
  bodyLimitKb: number;
  requestSchema: Record<string, unknown> | undefined;
}

export interface ResolvedAddonRoute {
  routeId: string;
  params: Record<string, string>;
  role: 'member' | 'admin';
  exposure: 'org' | 'public';
  bodyLimitKb: number;
  requestSchema: Record<string, unknown> | undefined;
}

const DEFAULT_BODY_LIMIT_KB = 64;

@Injectable()
export class AddonRouteTable {
  private readonly entries = new Map<string, AddonRouteEntry>();

  register(owner: OwnerKey, d: RouteSchema): void {
    const key = `${ownerKeyId(owner)}/${d.id}`;
    this.entries.set(key, {
      owner,
      routeId: d.id,
      method: d.method,
      path: d.path,
      role: d.role ?? 'member',
      exposure: d.exposure ?? 'org',
      bodyLimitKb: d.bodyLimitKb ?? DEFAULT_BODY_LIMIT_KB,
      requestSchema: d.requestSchema as Record<string, unknown> | undefined,
    });
  }

  removeOwner(owner: OwnerKey): void {
    const prefix = `${ownerKeyId(owner)}/`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  resolve(orgId: string, addonId: string, method: string, path: string): ResolvedAddonRoute | null {
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId !== orgId || entry.owner.addonId !== addonId) {
        continue;
      }
      if (entry.method !== method) {
        continue;
      }
      const match = matchRoutePattern(entry.path, path);
      if (match === null) {
        continue;
      }
      return {
        routeId: entry.routeId,
        params: match.params,
        role: entry.role,
        exposure: entry.exposure,
        bodyLimitKb: entry.bodyLimitKb,
        requestSchema: entry.requestSchema,
      };
    }
    return null;
  }

  list(orgId: string, addonId: string): AddonRouteEntry[] {
    return [...this.entries.values()].filter(
      (entry) => entry.owner.orgId === orgId && entry.owner.addonId === addonId,
    );
  }
}

@Injectable()
export class RouteFamilyModule implements FamilyModule<RouteSchema> {
  readonly family = 'route';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(private readonly table: AddonRouteTable) {}

  schema(_v: number): z.ZodType<RouteSchema> {
    return RouteDescriptorSchema as z.ZodType<RouteSchema>;
  }

  register(owner: OwnerKey, d: RouteSchema): Disposable {
    this.table.register(owner, d);
    return {
      dispose: () => {
        this.table.removeOwner(owner);
      },
    };
  }
}
