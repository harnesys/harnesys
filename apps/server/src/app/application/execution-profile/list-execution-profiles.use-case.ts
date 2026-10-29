import { Injectable } from '@harnesys/brix';
import type {
  ExecutionProfileIsolation,
  ExecutionProfileListItem,
  ExecutionProfilesResponse,
} from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';

export interface ListExecutionProfilesRequest {
  orgId: string;
}

@Injectable()
export class ListExecutionProfilesUseCase {
  constructor(
    private readonly profiles: ExecutionProfilePort,
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(request: ListExecutionProfilesRequest): ExecutionProfilesResponse {
    this.ensureOrgRuntime(request.orgId);
    const items = this.profiles.list(request.orgId);
    const defaultProfileId = this.profiles.getDefault(request.orgId) ?? null;
    return {
      items: items.map((item) => toListItem(item, defaultProfileId)),
      defaultProfileId,
    };
  }

  private ensureOrgRuntime(orgId: string): void {
    const entry = this.store.get(orgId);
    if (entry?.role !== 'relay') {
      return;
    }
    this.orgDb.bootstrap(orgId, entry.name);
    this.profiles.ensureLocalDefault(orgId, this.machineConfig.get().id);
  }
}

function toListItem(
  item: {
    id: string;
    orgId: string;
    name: string;
    system: boolean;
    nodeIds: string[];
    isolation: ExecutionProfileIsolation;
    dockerImage: string | null;
  },
  defaultProfileId: string | null,
): ExecutionProfileListItem {
  return {
    id: item.id,
    orgId: item.orgId,
    name: item.name,
    system: item.system,
    nodeIds: item.nodeIds,
    isolation: item.isolation,
    dockerImage: item.dockerImage,
    isDefault: item.id === defaultProfileId,
  };
}
