import { Module } from '@harnesys/brix';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { ExecutionProfileUseCaseModule } from '../execution-profile/execution-profile.use-case.module.ts';
import { PromoteRelayUseCase } from '../host/promote-relay.use-case.ts';
import { BuildOrgExecutionSnapshotUseCase } from './build-org-execution-snapshot.use-case.ts';
import { ClaimWorkUseCase } from './claim-work.use-case.ts';
import { ConnectInfoUseCase } from './connect-info.use-case.ts';
import { DisconnectFleetNodeUseCase } from './disconnect-fleet-node.use-case.ts';
import { EnrollOnRelayUseCase } from './enroll-on-relay.use-case.ts';
import { ExpiredClaimReaper } from './expired-claim-reaper.ts';
import { FetchRunAttachmentUseCase } from './fetch-run-attachment.use-case.ts';
import { GetActiveHostUseCase } from './get-active-host.use-case.ts';
import { HeartbeatUseCase } from './heartbeat.use-case.ts';
import { IngestRunEventUseCase } from './ingest-run-event.use-case.ts';
import { IssueCloudSourceSyncGrantUseCase } from './issue-cloud-source-sync-grant.use-case.ts';
import { IssueInviteUseCase } from './issue-invite.use-case.ts';
import { IssueRemoteRunUseCase } from './issue-remote-run.use-case.ts';
import { IssueWaitingRunUseCase } from './issue-waiting-run.use-case.ts';
import { ListFleetNodesUseCase } from './list-fleet-nodes.use-case.ts';
import { ListInvitesUseCase } from './list-invites.use-case.ts';
import { ListPlacementQueueUseCase } from './list-placement-queue.use-case.ts';
import { OrgSnapshotPushWatcher } from './org-snapshot-push-watcher.ts';
import { PairWithRelayUseCase } from './pair-with-relay.use-case.ts';
import { PlacePendingRunUseCase } from './place-pending-run.use-case.ts';
import { PlacementQueueWatcher } from './placement-queue-watcher.ts';
import { ReapExpiredRunClaimsUseCase } from './reap-expired-run-claims.use-case.ts';
import { ReleaseCloudSourceSyncGrantUseCase } from './release-cloud-source-sync-grant.use-case.ts';
import { RemoveFleetNodeUseCase } from './remove-fleet-node.use-case.ts';
import { ReschedulePlacementQueueUseCase } from './reschedule-placement-queue.use-case.ts';
import { ResolveFleetSecretsUseCase } from './resolve-fleet-secrets.use-case.ts';
import { RetargetUseCase } from './retarget.use-case.ts';
import { RevokeInviteUseCase } from './revoke-invite.use-case.ts';
import { RotateNodeTokenUseCase } from './rotate-node-token.use-case.ts';

@Module({
  imports: [ExecutionProfileUseCaseModule],
  providers: [
    IssueInviteUseCase,
    ListInvitesUseCase,
    RevokeInviteUseCase,
    EnrollOnRelayUseCase,
    PairWithRelayUseCase,
    HeartbeatUseCase,
    ListFleetNodesUseCase,
    GetActiveHostUseCase,
    ConnectInfoUseCase,
    RetargetUseCase,
    PromoteRelayUseCase,
    ResolveFleetSecretsUseCase,
    IssueCloudSourceSyncGrantUseCase,
    ReleaseCloudSourceSyncGrantUseCase,
    ClaimWorkUseCase,
    IngestRunEventUseCase,
    IssueRemoteRunUseCase,
    IssueWaitingRunUseCase,
    PlacePendingRunUseCase,
    ReschedulePlacementQueueUseCase,
    ListPlacementQueueUseCase,
    PlacementQueueWatcher,
    OrgSnapshotPushWatcher,
    ExpiredClaimReaper,
    ReapExpiredRunClaimsUseCase,
    BuildOrgExecutionSnapshotUseCase,
    FetchRunAttachmentUseCase,
    DisconnectFleetNodeUseCase,
    RemoveFleetNodeUseCase,
    RotateNodeTokenUseCase,
  ],
  exports: [
    IssueInviteUseCase,
    ListInvitesUseCase,
    RevokeInviteUseCase,
    EnrollOnRelayUseCase,
    PairWithRelayUseCase,
    HeartbeatUseCase,
    ListFleetNodesUseCase,
    GetActiveHostUseCase,
    ConnectInfoUseCase,
    RetargetUseCase,
    PromoteRelayUseCase,
    ResolveFleetSecretsUseCase,
    IssueCloudSourceSyncGrantUseCase,
    ReleaseCloudSourceSyncGrantUseCase,
    ClaimWorkUseCase,
    IngestRunEventUseCase,
    IssueRemoteRunUseCase,
    IssueWaitingRunUseCase,
    PlacePendingRunUseCase,
    ReschedulePlacementQueueUseCase,
    ListPlacementQueueUseCase,
    BuildOrgExecutionSnapshotUseCase,
    FetchRunAttachmentUseCase,
    DisconnectFleetNodeUseCase,
    RemoveFleetNodeUseCase,
    RotateNodeTokenUseCase,
    FleetContentProxyPort,
  ],
})
export class FleetUseCaseModule {}
