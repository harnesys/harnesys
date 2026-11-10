import { Injectable } from '@harnesys/brix';
import type { JsonObject } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import type { EffectiveGrants } from '../../../domain/addons/permissions.ts';
import { PermissionDefinitionRegistry } from './permission-definitions.ts';

@Injectable()
export class PermissionEngine {
  constructor(private readonly definitions: PermissionDefinitionRegistry) {}

  grantsCover(grants: EffectiveGrants, permissionId: string, needed?: JsonObject): boolean {
    const granted = grants.find((entry) => entry.id === permissionId);
    if (!granted) {
      return false;
    }
    const definition = this.definitions.get(permissionId);
    if (!definition) {
      return needed === undefined;
    }
    return definition.covers(granted.scope, needed);
  }

  assertCovered(grants: EffectiveGrants, permissionId: string, needed?: JsonObject): void {
    if (!this.grantsCover(grants, permissionId, needed)) {
      throw new AddonError('permission_denied', {
        detail: `permission not granted: ${permissionId}`,
      });
    }
  }

  scopeOf(grants: EffectiveGrants, permissionId: string): JsonObject | undefined {
    return grants.find((entry) => entry.id === permissionId)?.scope;
  }
}
