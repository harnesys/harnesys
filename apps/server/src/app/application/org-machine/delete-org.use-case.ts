import { Injectable } from '@harnesys/brix';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { CloudSyncBackWatchPort } from '../../domain/source/cloud-sync-back-watch.port.ts';

export interface DeleteOrgInput {
  orgId: string;
}

@Injectable()
export class DeleteOrgUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly layout: HostFsLayoutPort,
    private readonly hub: FleetHubPort,
    private readonly cloudSyncBackWatch: CloudSyncBackWatchPort,
  ) {}

  execute(input: DeleteOrgInput): void {
    const existing = this.store.get(input.orgId);
    if (!existing) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (existing.role === 'relay') {
      for (const nodeId of this.hub.peerNodeIds(input.orgId)) {
        try {
          this.hub.routeCommand(nodeId, { type: 'ORG_DELETED', orgId: input.orgId });
        } catch {
          // best-effort notify
        }
      }
    }
    this.cloudSyncBackWatch.stopOrg(input.orgId);
    this.store.remove(input.orgId);
    this.layout.removeOrgDir(input.orgId);
    this.layout.removeOrgDataDir(input.orgId);
  }
}
