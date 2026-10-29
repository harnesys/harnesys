import { Module } from '@harnesys/brix';
import { CloudSyncBackWatchPort } from '../../domain/source/cloud-sync-back-watch.port.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { IntegrationModule } from '../../infra/integration/integration.module.ts';
import { KnowledgeModule } from '../../infra/knowledge/knowledge.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { WorkspaceContainerModule } from '../../infra/process-runtime/workspace-container.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { CloudSyncBackModule } from '../../infra/source/drivers/cloud/cloud-sync-back.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { AttachCloudDriveUseCase } from './attach-cloud-drive.use-case.ts';
import { AttachGitUseCase } from './attach-git.use-case.ts';
import { AttachLocalFolderUseCase } from './attach-local-folder.use-case.ts';
import { BrowseHostDirsUseCase } from './browse-host-dirs.use-case.ts';
import { CheckoutGitUseCase } from './checkout-git.use-case.ts';
import { CommitGitUseCase } from './commit-git.use-case.ts';
import { CreateGitBranchUseCase } from './create-git-branch.use-case.ts';
import { CreateHostDirUseCase } from './create-host-dir.use-case.ts';
import { CreateRepositoryWorktreeUseCase } from './create-repository-worktree.use-case.ts';
import { DeleteGitBranchUseCase } from './delete-git-branch.use-case.ts';
import { DeleteRepositoryWorktreeUseCase } from './delete-repository-worktree.use-case.ts';
import { DetachSourceUseCase } from './detach-source.use-case.ts';
import { EnsureWorkspaceUseCase } from './ensure-workspace.use-case.ts';
import { GetGitDiffUseCase } from './get-git-diff.use-case.ts';
import { GetGitFileStatusUseCase } from './get-git-file-status.use-case.ts';
import { GetGitStatusUseCase } from './get-git-status.use-case.ts';
import { GetOrgGitSummaryUseCase } from './get-org-git-summary.use-case.ts';
import { GetSourceUseCase } from './get-source.use-case.ts';
import { GetSourceHostStatusUseCase } from './get-source-host-status.use-case.ts';
import { GetSourceLocationUseCase } from './get-source-location.use-case.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { InitGitUseCase } from './init-git.use-case.ts';
import { ListGitBranchesUseCase } from './list-git-branches.use-case.ts';
import { ListRepositoryWorktreesUseCase } from './list-repository-worktrees.use-case.ts';
import { ListSourcesUseCase } from './list-sources.use-case.ts';
import { PrepareCloudSourceUseCase } from './prepare-cloud-source.use-case.ts';
import { PrepareGitSourceUseCase } from './prepare-git-source.use-case.ts';
import { PullGitUseCase } from './pull-git.use-case.ts';
import { PushGitUseCase } from './push-git.use-case.ts';
import { RefreshAllSourceVcsUseCase } from './refresh-all-source-vcs.use-case.ts';
import { RefreshCloudDriveUseCase } from './refresh-cloud-drive.use-case.ts';
import { RefreshGitSourceUseCase } from './refresh-git-source.use-case.ts';
import { RefreshSourceVcsUseCase } from './refresh-source-vcs.use-case.ts';
import { RenameSourceUseCase } from './rename-source.use-case.ts';
import { SetGitRemoteUseCase } from './set-git-remote.use-case.ts';
import { SetSourceAvailabilityUseCase } from './set-source-availability.use-case.ts';
import { SetSourceVisibilityUseCase } from './set-source-visibility.use-case.ts';
import { StageGitUseCase } from './stage-git.use-case.ts';
import { SwitchGitBranchUseCase } from './switch-git-branch.use-case.ts';

@Module({
  imports: [
    MachineHomeModule,
    SourceModule,
    FleetHubModule,
    CloudSyncBackModule,
    SecretModule,
    IntegrationModule,
    KnowledgeModule,
    WorkspaceContainerModule,
  ],
  providers: [
    EnsureWorkspaceUseCase,
    ListSourcesUseCase,
    GetSourceUseCase,
    GetSourceHostStatusUseCase,
    GetSourceLocationUseCase,
    BrowseHostDirsUseCase,
    CreateHostDirUseCase,
    AttachLocalFolderUseCase,
    AttachGitUseCase,
    AttachCloudDriveUseCase,
    PrepareGitSourceUseCase,
    PrepareCloudSourceUseCase,
    GitWorktreeResolver,
    RefreshAllSourceVcsUseCase,
    RefreshSourceVcsUseCase,
    RefreshGitSourceUseCase,
    RefreshCloudDriveUseCase,
    SwitchGitBranchUseCase,
    ListGitBranchesUseCase,
    GetGitStatusUseCase,
    GetGitFileStatusUseCase,
    GetOrgGitSummaryUseCase,
    GetGitDiffUseCase,
    StageGitUseCase,
    CommitGitUseCase,
    PushGitUseCase,
    PullGitUseCase,
    CheckoutGitUseCase,
    CreateGitBranchUseCase,
    DeleteGitBranchUseCase,
    CreateRepositoryWorktreeUseCase,
    ListRepositoryWorktreesUseCase,
    DeleteRepositoryWorktreeUseCase,
    InitGitUseCase,
    DetachSourceUseCase,
    SetSourceVisibilityUseCase,
    RenameSourceUseCase,
    SetGitRemoteUseCase,
    SetSourceAvailabilityUseCase,
  ],
  exports: [
    EnsureWorkspaceUseCase,
    ListSourcesUseCase,
    GetSourceUseCase,
    GetSourceHostStatusUseCase,
    GetSourceLocationUseCase,
    BrowseHostDirsUseCase,
    CreateHostDirUseCase,
    AttachLocalFolderUseCase,
    AttachGitUseCase,
    AttachCloudDriveUseCase,
    PrepareGitSourceUseCase,
    PrepareCloudSourceUseCase,
    GitWorktreeResolver,
    RefreshAllSourceVcsUseCase,
    RefreshSourceVcsUseCase,
    RefreshGitSourceUseCase,
    RefreshCloudDriveUseCase,
    SwitchGitBranchUseCase,
    ListGitBranchesUseCase,
    GetGitStatusUseCase,
    GetGitFileStatusUseCase,
    GetOrgGitSummaryUseCase,
    GetGitDiffUseCase,
    StageGitUseCase,
    CommitGitUseCase,
    PushGitUseCase,
    PullGitUseCase,
    CheckoutGitUseCase,
    CreateGitBranchUseCase,
    DeleteGitBranchUseCase,
    CreateRepositoryWorktreeUseCase,
    ListRepositoryWorktreesUseCase,
    DeleteRepositoryWorktreeUseCase,
    InitGitUseCase,
    DetachSourceUseCase,
    SetSourceVisibilityUseCase,
    RenameSourceUseCase,
    SetGitRemoteUseCase,
    SetSourceAvailabilityUseCase,
    CloudSyncBackWatchPort,
  ],
})
export class SourceUseCaseModule {}
