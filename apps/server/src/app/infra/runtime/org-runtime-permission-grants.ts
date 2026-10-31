import { PermissionGrantsPort } from 'harnesys';
import type { PermissionGrantStorePort } from '../../domain/approval/permission-grant-store.port.ts';

class OrgPermissionGrants extends PermissionGrantsPort {
  constructor(
    private readonly store: PermissionGrantStorePort,
    private readonly orgId: string,
  ) {
    super();
  }

  override async granted(agentId: string, operation: string): Promise<boolean> {
    return this.store.has(this.orgId, agentId, operation);
  }
}

export function runTargetPermissionGrants(
  store: PermissionGrantStorePort | undefined,
  orgId: string,
): PermissionGrantsPort | undefined {
  if (store === undefined) {
    return undefined;
  }
  return new OrgPermissionGrants(store, orgId);
}
