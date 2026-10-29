import { Module } from '@harnesys/brix';
import { NodeTicketAccess } from '../../application/identity/node-ticket-access.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { FleetEventsPort } from '../../domain/fleet/fleet-events.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { InviteRepository } from '../../domain/fleet/invite-repository.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { PendingPlacementPort } from '../../domain/fleet/pending-placement.port.ts';
import { PromoteSessionStore } from '../../domain/fleet/promote-session.port.ts';
import { SourceWriteLeasePort } from '../../domain/fleet/source-write-lease.port.ts';
import { WorkerOrgOperationReceiptPort } from '../../domain/fleet/worker-org-operation-receipt.port.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { ConsumedTicketStore } from '../../domain/machine/consumed-ticket-store.port.ts';
import { WorkerContentHandler } from '../content/worker-content.handler.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ConsumedTicketStoreAdapter } from '../node-identity/consumed-ticket-store.adapter.ts';
import { NodeIdentityStoreAdapter } from '../node-identity/node-identity-store.adapter.ts';
import { EventClaimAdapter } from '../org-sqlite/event-claim.adapter.ts';
import { InviteRepositoryAdapter } from '../org-sqlite/invite-repository.adapter.ts';
import { NodeCommandQueueAdapter } from '../org-sqlite/node-command-queue.adapter.ts';
import { NodeRepositoryAdapter } from '../org-sqlite/node-repository.adapter.ts';
import { NodeSnapshotAckAdapter } from '../org-sqlite/node-snapshot-ack.adapter.ts';
import { OrgAuditAdapter } from '../org-sqlite/org-audit.adapter.ts';
import { OrgConfigRevisionAdapter } from '../org-sqlite/org-config-revision.adapter.ts';
import { PendingPlacementAdapter } from '../org-sqlite/pending-placement.adapter.ts';
import { SourceWriteLeaseAdapter } from '../org-sqlite/source-write-lease.adapter.ts';
import { TicketKeyStoreAdapter } from '../org-sqlite/ticket-key.adapter.ts';
import { WorkerOrgOperationReceiptAdapter } from '../org-sqlite/worker-org-operation-receipt.adapter.ts';
import { SourceModule } from '../source/source.module.ts';
import { FleetContentProxyAdapter } from './fleet-content-proxy.adapter.ts';
import { FleetEventsAdapter } from './fleet-events.adapter.ts';
import { FleetHubAdapter } from './fleet-hub.adapter.ts';
import { PromoteSessionAdapter } from './promote-session.adapter.ts';

@Module({
  imports: [MachineHomeModule, SourceModule],
  providers: [
    { provide: InviteRepository, useClass: InviteRepositoryAdapter },
    { provide: NodeRepository, useClass: NodeRepositoryAdapter },
    { provide: NodeIdentityStore, useClass: NodeIdentityStoreAdapter },
    { provide: ConsumedTicketStore, useClass: ConsumedTicketStoreAdapter },
    { provide: EventClaimPort, useClass: EventClaimAdapter },
    { provide: NodeCommandQueuePort, useClass: NodeCommandQueueAdapter },
    { provide: SourceWriteLeasePort, useClass: SourceWriteLeaseAdapter },
    { provide: OrgConfigRevisionPort, useClass: OrgConfigRevisionAdapter },
    { provide: NodeSnapshotAckPort, useClass: NodeSnapshotAckAdapter },
    { provide: WorkerOrgOperationReceiptPort, useClass: WorkerOrgOperationReceiptAdapter },
    { provide: PendingPlacementPort, useClass: PendingPlacementAdapter },
    { provide: FleetHubPort, useClass: FleetHubAdapter },
    { provide: FleetContentProxyPort, useClass: FleetContentProxyAdapter },
    { provide: FleetEventsPort, useClass: FleetEventsAdapter },
    { provide: PromoteSessionStore, useClass: PromoteSessionAdapter },
    { provide: TicketKeyStore, useClass: TicketKeyStoreAdapter },
    { provide: OrgAudit, useClass: OrgAuditAdapter },
    NodeTicketAccess,
    NodeTicketAccess,
    WorkerContentHandler,
  ],
  exports: [
    InviteRepository,
    NodeRepository,
    NodeIdentityStore,
    ConsumedTicketStore,
    EventClaimPort,
    NodeCommandQueuePort,
    SourceWriteLeasePort,
    OrgConfigRevisionPort,
    NodeSnapshotAckPort,
    WorkerOrgOperationReceiptPort,
    PendingPlacementPort,
    FleetHubPort,
    FleetContentProxyPort,
    FleetEventsPort,
    PromoteSessionStore,
    TicketKeyStore,
    OrgAudit,
    NodeTicketAccess,
    WorkerContentHandler,
  ],
})
export class FleetHubModule {}
