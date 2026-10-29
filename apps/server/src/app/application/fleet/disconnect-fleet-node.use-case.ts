import { Injectable } from '@harnesys/brix';
import {
  CannotRemoveRelayException,
  FleetNodeMissingException,
  NotRelayOrgException,
} from '../../domain/fleet/fleet.error.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

export interface DisconnectFleetNodeInput {
  orgId: string;
  nodeId: string;
}

@Injectable()
export class DisconnectFleetNodeUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly nodes: NodeRepository,
    private readonly hub: FleetHubPort,
    private readonly events: FleetEventsPort,
  ) {}

  execute(input: DisconnectFleetNodeInput): void {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(input.orgId);
    }
    const node = this.nodes.findById(input.orgId, input.nodeId);
    if (!node) {
      throw new FleetNodeMissingException(input.nodeId);
    }
    if (node.role === 'relay') {
      throw new CannotRemoveRelayException();
    }
    this.nodes.setStatus(input.orgId, input.nodeId, 'draining');
    if (this.hub.hasPeer(input.nodeId)) {
      this.hub.routeCommand(input.nodeId, { type: 'NODE_DRAIN' });
    }
    this.hub.detachPeer(input.nodeId);
    this.events.emit(input.orgId);
  }
}
