import { Injectable } from '@harnesys/brix';
import type { FleetNode, FleetNodesResponse } from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NotRelayOrgException } from '../../domain/fleet/fleet.error.ts';
import { FleetHubPort, type FleetPresenceNode } from '../../domain/fleet/fleet-hub.port.ts';
import { resolveNodeConfigSync } from '../../domain/fleet/node-config-sync.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';

@Injectable()
export class ListFleetNodesUseCase {
  constructor(
    private readonly hub: FleetHubPort,
    private readonly store: OrgMachineStore,
    private readonly claims: EventClaimPort,
    private readonly snapshotAcks: NodeSnapshotAckPort,
    private readonly revisions: OrgConfigRevisionPort,
  ) {}

  execute(orgId: string): FleetNodesResponse {
    const entry = this.store.get(orgId);
    if (!entry) {
      throw new OrgNotFoundException(orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(orgId);
    }
    const now = new Date().toISOString();
    const targetRevision = this.revisions.get(orgId).revision;
    const nodes = this.hub.listPresence(orgId).map((node) =>
      enrichNode({
        node,
        claims: this.claims,
        hub: this.hub,
        snapshotAcks: this.snapshotAcks,
        orgId,
        nowIso: now,
        targetRevision,
      }),
    );
    return { nodes };
  }
}

interface EnrichNodeInput {
  node: FleetPresenceNode;
  claims: EventClaimPort;
  hub: FleetHubPort;
  snapshotAcks: NodeSnapshotAckPort;
  orgId: string;
  nowIso: string;
  targetRevision: number;
}

function enrichNode(input: EnrichNodeInput): FleetNode {
  const { node, claims, hub, snapshotAcks, orgId, nowIso, targetRevision } = input;
  const activeClaims = claims.countActiveByNode(orgId, node.id, nowIso);
  const sync = resolveNodeConfigSync({
    role: node.role,
    status: node.status,
    peerConnected: hub.hasPeer(node.id),
    targetRevision,
    ack: snapshotAcks.find(orgId, node.id),
  });
  return {
    ...node,
    activeClaims,
    acceptsWork: node.role === 'relay' || node.status === 'online',
    configSync: sync.configSync,
    acceptedRevision: sync.acceptedRevision,
    targetRevision: sync.targetRevision,
    syncReason: sync.syncReason,
  };
}
