import { Injectable } from '@harnesys/brix';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

export interface ActiveHostRequest {
  principal: Principal;
  orgId: string;
}

export interface ActiveHostResponse {
  hostId: string;
}

@Injectable()
export class GetActiveHostUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly store: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(request: ActiveHostRequest): ActiveHostResponse {
    if (!authorize(request.principal, 'org.read', { orgId: request.orgId })) {
      throw new OrgNotFoundException(request.orgId);
    }
    if (!this.store.get(request.orgId)) {
      throw new OrgNotFoundException(request.orgId);
    }
    const rows = this.nodes.list(request.orgId);
    const relay = rows.find((node) => node.role === 'relay');
    if (relay) {
      return { hostId: relay.id };
    }
    const online = rows.find((node) => node.status === 'online' || node.status === 'draining');
    if (online) {
      return { hostId: online.id };
    }
    return { hostId: this.machineConfig.get().id };
  }
}
