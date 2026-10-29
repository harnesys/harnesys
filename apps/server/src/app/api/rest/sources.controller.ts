import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@harnesys/brix';
import {
  type AttachCloudDriveBody,
  AttachCloudDriveBodySchema,
  type AttachGitBody,
  AttachGitBodySchema,
  type DeleteGitBranchBody,
  DeleteGitBranchBodySchema,
  type GitHostQuery,
  GitHostQuerySchema,
  type RefreshCloudDriveBody,
  RefreshCloudDriveBodySchema,
  type RefreshGitSourceBody,
  RefreshGitSourceBodySchema,
  type RenameSourceBody,
  RenameSourceBodySchema,
  type SetSourceVisibilityBody,
  SetSourceVisibilityBodySchema,
  type Source,
  type SourceHostStatusResponse,
  type SourceLocationQuery,
  SourceLocationQuerySchema,
  type SourceLocationResponse,
  type SourcesListResponse,
  type SwitchGitBranchBody,
  SwitchGitBranchBodySchema,
} from '@harnesys/contracts';
import { AttachCloudDriveUseCase } from '../../application/source/attach-cloud-drive.use-case.ts';
import { AttachGitUseCase } from '../../application/source/attach-git.use-case.ts';
import { DeleteGitBranchUseCase } from '../../application/source/delete-git-branch.use-case.ts';
import { DetachSourceUseCase } from '../../application/source/detach-source.use-case.ts';
import { GetSourceUseCase } from '../../application/source/get-source.use-case.ts';
import { GetSourceHostStatusUseCase } from '../../application/source/get-source-host-status.use-case.ts';
import { GetSourceLocationUseCase } from '../../application/source/get-source-location.use-case.ts';
import {
  type ListGitBranchesResult,
  ListGitBranchesUseCase,
} from '../../application/source/list-git-branches.use-case.ts';
import { ListSourcesUseCase } from '../../application/source/list-sources.use-case.ts';
import { RefreshCloudDriveUseCase } from '../../application/source/refresh-cloud-drive.use-case.ts';
import { RefreshGitSourceUseCase } from '../../application/source/refresh-git-source.use-case.ts';
import { RenameSourceUseCase } from '../../application/source/rename-source.use-case.ts';
import { SetSourceVisibilityUseCase } from '../../application/source/set-source-visibility.use-case.ts';
import { SwitchGitBranchUseCase } from '../../application/source/switch-git-branch.use-case.ts';
import { SurfaceHostIdHeader } from '../surface-host.ts';

@Controller('orgs/:orgId/sources')
export class SourcesController {
  constructor(
    private readonly listSources: ListSourcesUseCase,
    private readonly getSource: GetSourceUseCase,
    private readonly getSourceHostStatus: GetSourceHostStatusUseCase,
    private readonly getSourceLocation: GetSourceLocationUseCase,
    private readonly attachGit: AttachGitUseCase,
    private readonly attachCloud: AttachCloudDriveUseCase,
    private readonly refreshGit: RefreshGitSourceUseCase,
    private readonly refreshCloud: RefreshCloudDriveUseCase,
    private readonly switchGitBranch: SwitchGitBranchUseCase,
    private readonly deleteGitBranch: DeleteGitBranchUseCase,
    private readonly listGitBranches: ListGitBranchesUseCase,
    private readonly detachSource: DetachSourceUseCase,
    private readonly setVisibility: SetSourceVisibilityUseCase,
    private readonly renameSource: RenameSourceUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): SourcesListResponse {
    return this.listSources.execute({ orgId, surfaceHostId });
  }

  @Post('git')
  @HttpCode(201)
  attachGitSource(
    @Param('orgId') orgId: string,
    @Body(AttachGitBodySchema) body: AttachGitBody,
  ): Promise<Source> {
    return this.attachGit.execute({
      orgId,
      url: body.url,
      name: body.name,
      hostId: body.hostId,
      uiVisibility: body.uiVisibility,
      branch: body.branch,
      credRef: body.credRef,
      integrationId: body.integrationId,
      repo: body.repo,
    });
  }

  @Post('cloud')
  @HttpCode(201)
  attachCloudSource(
    @Param('orgId') orgId: string,
    @Body(AttachCloudDriveBodySchema) body: AttachCloudDriveBody,
  ): Source {
    return this.attachCloud.execute({
      orgId,
      name: body.name,
      backend: body.backend,
      remoteFolderId: body.remoteFolderId,
      integrationId: body.integrationId,
      hostId: body.hostId,
      uiVisibility: body.uiVisibility,
    });
  }

  @Get(':sourceId')
  get(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): Source {
    return this.getSource.execute({ orgId, sourceId, surfaceHostId });
  }

  @Get(':sourceId/host-status')
  hostStatus(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): SourceHostStatusResponse {
    return this.getSourceHostStatus.execute({ orgId, sourceId, surfaceHostId });
  }

  @Get(':sourceId/location')
  location(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(SourceLocationQuerySchema) query: SourceLocationQuery,
  ): SourceLocationResponse {
    return this.getSourceLocation.execute({ orgId, sourceId, hostId: query.hostId });
  }

  @Post(':sourceId/git/refresh')
  refreshGitSource(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(RefreshGitSourceBodySchema) body: RefreshGitSourceBody,
  ): Promise<Source> {
    return this.refreshGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
    });
  }

  @Get(':sourceId/git/branches')
  gitBranches(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(GitHostQuerySchema) query: GitHostQuery,
  ): Promise<ListGitBranchesResult> {
    return this.listGitBranches.execute({ orgId, sourceId, hostId: query.hostId });
  }

  @Post(':sourceId/git/branch')
  switchBranch(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(SwitchGitBranchBodySchema) body: SwitchGitBranchBody,
  ): Promise<Source> {
    return this.switchGitBranch.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      branch: body.branch,
    });
  }

  @Post(':sourceId/git/branch/delete')
  deleteBranch(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(DeleteGitBranchBodySchema) body: DeleteGitBranchBody,
  ): Promise<Source> {
    return this.deleteGitBranch.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      branch: body.branch,
    });
  }

  @Post(':sourceId/cloud/refresh')
  refreshCloudSource(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(RefreshCloudDriveBodySchema) body: RefreshCloudDriveBody,
  ): Promise<{ source: Source; skippedGoogleApps: number; state: string }> {
    return this.refreshCloud.execute({ orgId, sourceId, hostId: body.hostId });
  }

  @Delete(':sourceId')
  @HttpCode(204)
  detach(@Param('orgId') orgId: string, @Param('sourceId') sourceId: string): void {
    this.detachSource.execute({ orgId, sourceId });
  }

  @Patch(':sourceId/visibility')
  setSourceVisibility(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(SetSourceVisibilityBodySchema) body: SetSourceVisibilityBody,
  ): Source {
    return this.setVisibility.execute({
      orgId,
      sourceId,
      uiVisibility: body.uiVisibility,
    });
  }

  @Patch(':sourceId')
  rename(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(RenameSourceBodySchema) body: RenameSourceBody,
  ): Source {
    return this.renameSource.execute({
      orgId,
      sourceId,
      name: body.name,
    });
  }
}
