import { ForbiddenException, Injectable } from '@harnesys/brix';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import {
  CannotRemoveRelayException,
  FleetNodeMissingException,
  NotRelayOrgException,
} from '../../domain/fleet/fleet.error.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';
import { orgAuditRow } from './org-audit-row.ts';

export interface RemoveFleetNodeInput {
  principal: Principal;
  orgId: string;
  nodeId: string;
}

@Injectable()
export class RemoveFleetNodeUseCase {
  constructor(
    private readonly store: OrgMachineStore,
    private readonly nodes: NodeRepository,
    private readonly profiles: ExecutionProfilePort,
    private readonly pending: PendingPlacementPort,
    private readonly hub: FleetHubPort,
    private readonly events: FleetEventsPort,
    private readonly executor: LocalExecutorPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly keys: TicketKeyStore,
    private readonly audit: OrgAudit,
    private readonly buildSnapshot: BuildOrgExecutionSnapshotUseCase,
  ) {}

  async execute(input: RemoveFleetNodeInput): Promise<void> {
    if (!authorize(input.principal, 'fleet.manage', { orgId: input.orgId })) {
      throw new ForbiddenException('fleet.manage capability is required');
    }
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
    this.profiles.removeNodeFromAll(input.orgId, input.nodeId);
    await this.failPendingForNode(input.orgId, input.nodeId);
    if (this.hub.hasPeer(input.nodeId)) {
      this.hub.routeCommand(input.nodeId, { type: 'NODE_REMOVED', orgId: input.orgId });
    }
    this.hub.detachPeer(input.nodeId);
    this.nodes.updateRoleAndToken(input.orgId, input.nodeId, {
      role: node.role,
      tokenHash: null,
    });
    this.nodes.remove(input.orgId, input.nodeId);
    this.keys.rotate(input.orgId);
    this.bumpRevision(input.orgId, input.nodeId);
    this.buildSnapshot.execute(input.orgId);
    this.events.emit(input.orgId);
    this.audit.append(
      input.orgId,
      orgAuditRow(new Date().toISOString(), {
        actorKind: input.principal.kind,
        actorId: input.principal.kind === 'user' ? input.principal.userId : input.principal.nodeId,
        viaNodeId: null,
        action: 'node_removed',
        resource: input.nodeId,
        result: 'ok',
      }),
    );
  }

  private bumpRevision(orgId: string, nodeId: string): void {
    const current = this.revisions.get(orgId);
    this.revisions.sync(orgId, `${current.contentHash}|node-removed:${nodeId}`);
  }

  private async failPendingForNode(orgId: string, nodeId: string): Promise<void> {
    const rows = this.pending
      .listByOrg(orgId)
      .filter((row) => candidatesInclude(row.lastCandidatesJson, nodeId));
    if (rows.length === 0) {
      return;
    }
    const lifecycle = await this.executor.lifecycle(orgId);
    for (const row of rows) {
      const record = await lifecycle.get(row.runId);
      if (record?.status === 'waiting') {
        try {
          await lifecycle.transition(row.runId, record.leaseEpoch, {
            from: 'waiting',
            to: 'failed',
            events: [{ type: 'run.failed', message: 'NODE_REMOVED' }],
          });
        } catch {
          // best-effort fail
        }
      }
      this.pending.remove(orgId, row.runId);
    }
  }
}

function candidatesInclude(raw: string, nodeId: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Array<{ nodeId?: unknown }>;
    if (!Array.isArray(parsed)) {
      return false;
    }
    return parsed.some((item) => item && item.nodeId === nodeId);
  } catch {
    return false;
  }
}
