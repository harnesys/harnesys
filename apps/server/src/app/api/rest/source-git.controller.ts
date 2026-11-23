import { Body, Controller, Get, Param, Post, Query } from '@harnesys/brix';
import { CheckoutGitUseCase } from '../../application/source/checkout-git.use-case.ts';
import { CommitGitUseCase } from '../../application/source/commit-git.use-case.ts';
import {
  type CreateGitBranchResult,
  CreateGitBranchUseCase,
} from '../../application/source/create-git-branch.use-case.ts';
import { DiscardGitUseCase } from '../../application/source/discard-git.use-case.ts';
import { FetchGitUseCase } from '../../application/source/fetch-git.use-case.ts';
import {
  type GenerateCommitMessageResult,
  GenerateCommitMessageUseCase,
} from '../../application/source/generate-commit-message.use-case.ts';
import { GetGitDiffUseCase } from '../../application/source/get-git-diff.use-case.ts';
import { GetGitFileStatusUseCase } from '../../application/source/get-git-file-status.use-case.ts';
import {
  type GetGitLogResult,
  GetGitLogUseCase,
} from '../../application/source/get-git-log.use-case.ts';
import { GetGitShowUseCase } from '../../application/source/get-git-show.use-case.ts';
import { GetGitStatusUseCase } from '../../application/source/get-git-status.use-case.ts';
import { InitGitUseCase } from '../../application/source/init-git.use-case.ts';
import { MergeGitBranchUseCase } from '../../application/source/merge-git-branch.use-case.ts';
import { PullGitUseCase } from '../../application/source/pull-git.use-case.ts';
import { PushGitUseCase } from '../../application/source/push-git.use-case.ts';
import { RevertGitUseCase } from '../../application/source/revert-git.use-case.ts';
import { StageGitUseCase } from '../../application/source/stage-git.use-case.ts';
import { UnstageGitUseCase } from '../../application/source/unstage-git.use-case.ts';
import type {
  GitCommitDetail,
  GitDiffResponse,
  GitFileStatusResponse,
  GitStatusResponse,
} from '../../domain/source/git-vcs.types.ts';
import * as gitSchema from './source-git.schema.ts';

@Controller('orgs/:orgId/sources/:sourceId/git')
export class SourceGitController {
  constructor(
    private readonly getStatus: GetGitStatusUseCase,
    private readonly getFileStatus: GetGitFileStatusUseCase,
    private readonly getDiff: GetGitDiffUseCase,
    private readonly getGitLog: GetGitLogUseCase,
    private readonly getGitShow: GetGitShowUseCase,
    private readonly stageGit: StageGitUseCase,
    private readonly unstageGit: UnstageGitUseCase,
    private readonly discardGit: DiscardGitUseCase,
    private readonly commitGit: CommitGitUseCase,
    private readonly revertGit: RevertGitUseCase,
    private readonly generateCommitMessage: GenerateCommitMessageUseCase,
    private readonly pushGit: PushGitUseCase,
    private readonly pullGit: PullGitUseCase,
    private readonly fetchGit: FetchGitUseCase,
    private readonly checkoutGit: CheckoutGitUseCase,
    private readonly mergeGitBranch: MergeGitBranchUseCase,
    private readonly createGitBranch: CreateGitBranchUseCase,
    private readonly initGit: InitGitUseCase,
  ) {}

  @Get('status')
  status(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(gitSchema.GitHostWorktreeQuerySchema) query: gitSchema.GitHostWorktreeQuery,
  ): Promise<GitStatusResponse> {
    return this.getStatus.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
    });
  }

  @Get('file-status')
  fileStatus(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(gitSchema.GitFileStatusQuerySchema) query: gitSchema.GitFileStatusQuery,
  ): Promise<GitFileStatusResponse> {
    return this.getFileStatus.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
      path: query.path,
    });
  }

  @Get('diff')
  diff(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(gitSchema.GitDiffQuerySchema) query: gitSchema.GitDiffQuery,
  ): Promise<GitDiffResponse> {
    return this.getDiff.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
      path: query.path,
    });
  }

  @Get('log')
  log(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(gitSchema.GitLogQuerySchema) query: gitSchema.GitLogQuery,
  ): Promise<GetGitLogResult> {
    return this.getGitLog.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
      limit: query.limit,
    });
  }

  @Get('show')
  show(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(gitSchema.GitShowQuerySchema) query: gitSchema.GitShowQuery,
  ): Promise<GitCommitDetail> {
    return this.getGitShow.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
      sha: query.sha,
    });
  }

  @Post('add')
  add(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.StageGitBodySchema) body: gitSchema.StageGitBody,
  ): Promise<{ ok: true }> {
    return this.stageGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      paths: body.paths ?? [],
    });
  }

  @Post('unstage')
  unstage(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.UnstageGitBodySchema) body: gitSchema.UnstageGitBody,
  ): Promise<{ ok: true }> {
    return this.unstageGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      paths: body.paths,
    });
  }

  @Post('discard')
  discard(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.DiscardGitBodySchema) body: gitSchema.DiscardGitBody,
  ): Promise<{ ok: true }> {
    return this.discardGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      paths: body.paths,
      untrackedPaths: body.untrackedPaths,
    });
  }

  @Post('commit')
  commit(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.CommitGitBodySchema) body: gitSchema.CommitGitBody,
  ): Promise<{ ok: true }> {
    return this.commitGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      message: body.message,
      ...(body.paths !== undefined ? { paths: body.paths } : {}),
      ...(body.amend !== undefined ? { amend: body.amend } : {}),
    });
  }

  @Post('revert')
  revert(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.GitRevertBodySchema) body: gitSchema.GitRevertBody,
  ): Promise<{ ok: true }> {
    return this.revertGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      sha: body.sha,
    });
  }

  @Post('generate-message')
  generateMessage(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.GenerateCommitMessageBodySchema) body: gitSchema.GenerateCommitMessageBody,
  ): Promise<GenerateCommitMessageResult> {
    return this.generateCommitMessage.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      paths: body.paths,
    });
  }

  @Post('push')
  push(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.HostWorktreeBodySchema) body: gitSchema.HostWorktreeBody,
  ): Promise<{ ok: true }> {
    return this.pushGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
    });
  }

  @Post('pull')
  pull(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.HostWorktreeBodySchema) body: gitSchema.HostWorktreeBody,
  ): Promise<{ ok: true }> {
    return this.pullGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
    });
  }

  @Post('fetch')
  fetch(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.HostWorktreeBodySchema) body: gitSchema.HostWorktreeBody,
  ): Promise<{ ok: true }> {
    return this.fetchGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
    });
  }

  @Post('checkout')
  checkout(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.CheckoutGitBodySchema) body: gitSchema.CheckoutGitBody,
  ): Promise<{ ok: true }> {
    return this.checkoutGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      branch: body.branch,
    });
  }

  @Post('merge')
  merge(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.MergeGitBodySchema) body: gitSchema.MergeGitBody,
  ): Promise<{ ok: true }> {
    return this.mergeGitBranch.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      branch: body.branch,
    });
  }

  @Post('branches')
  createBranch(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.CreateGitBranchBodySchema) body: gitSchema.CreateGitBranchBody,
  ): Promise<CreateGitBranchResult> {
    return this.createGitBranch.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      name: body.name,
      checkout: body.checkout,
      from: body.from,
    });
  }

  @Post('init')
  init(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(gitSchema.GitHostQuerySchema) body: gitSchema.GitHostQuery,
  ): Promise<{ ok: true }> {
    return this.initGit.execute({ orgId, sourceId, hostId: body.hostId });
  }
}
