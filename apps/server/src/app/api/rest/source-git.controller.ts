import { Body, Controller, Get, Param, Post, Query } from '@harnesys/brix';
import { z } from 'zod';
import { CheckoutGitUseCase } from '../../application/source/checkout-git.use-case.ts';
import { CommitGitUseCase } from '../../application/source/commit-git.use-case.ts';
import {
  type CreateGitBranchResult,
  CreateGitBranchUseCase,
} from '../../application/source/create-git-branch.use-case.ts';
import { GetGitDiffUseCase } from '../../application/source/get-git-diff.use-case.ts';
import { GetGitFileStatusUseCase } from '../../application/source/get-git-file-status.use-case.ts';
import { GetGitStatusUseCase } from '../../application/source/get-git-status.use-case.ts';
import { InitGitUseCase } from '../../application/source/init-git.use-case.ts';
import { PullGitUseCase } from '../../application/source/pull-git.use-case.ts';
import { PushGitUseCase } from '../../application/source/push-git.use-case.ts';
import { StageGitUseCase } from '../../application/source/stage-git.use-case.ts';
import type {
  GitDiffResponse,
  GitFileStatusMap,
  GitStatusResponse,
} from '../../domain/source/git-vcs.types.ts';

const HostIdSchema = z.string().uuid();
const WorktreeIdSchema = z.string().min(1);

const GitHostWorktreeQuerySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
});
type GitHostWorktreeQuery = z.infer<typeof GitHostWorktreeQuerySchema>;

const GitHostQuerySchema = z.object({
  hostId: HostIdSchema,
});
type GitHostQuery = z.infer<typeof GitHostQuerySchema>;

const GitFileStatusQuerySchema = GitHostWorktreeQuerySchema.extend({
  path: z.string().optional(),
});
type GitFileStatusQuery = z.infer<typeof GitFileStatusQuerySchema>;

const GitDiffQuerySchema = GitHostWorktreeQuerySchema.extend({
  path: z.string().min(1),
});
type GitDiffQuery = z.infer<typeof GitDiffQuerySchema>;

const StageGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  paths: z.array(z.string()).optional(),
});
type StageGitBody = z.infer<typeof StageGitBodySchema>;

const CommitGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  message: z.string().min(1),
});
type CommitGitBody = z.infer<typeof CommitGitBodySchema>;

const CheckoutGitBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  branch: z.string().min(1),
});
type CheckoutGitBody = z.infer<typeof CheckoutGitBodySchema>;

const CreateGitBranchBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
  name: z.string().min(1),
  checkout: z.boolean().optional(),
  from: z.string().min(1).optional(),
});
type CreateGitBranchBody = z.infer<typeof CreateGitBranchBodySchema>;

const HostWorktreeBodySchema = z.object({
  hostId: HostIdSchema,
  worktreeId: WorktreeIdSchema,
});
type HostWorktreeBody = z.infer<typeof HostWorktreeBodySchema>;

@Controller('orgs/:orgId/sources/:sourceId/git')
export class SourceGitController {
  constructor(
    private readonly getStatus: GetGitStatusUseCase,
    private readonly getFileStatus: GetGitFileStatusUseCase,
    private readonly getDiff: GetGitDiffUseCase,
    private readonly stageGit: StageGitUseCase,
    private readonly commitGit: CommitGitUseCase,
    private readonly pushGit: PushGitUseCase,
    private readonly pullGit: PullGitUseCase,
    private readonly checkoutGit: CheckoutGitUseCase,
    private readonly createGitBranch: CreateGitBranchUseCase,
    private readonly initGit: InitGitUseCase,
  ) {}

  @Get('status')
  status(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(GitHostWorktreeQuerySchema) query: GitHostWorktreeQuery,
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
    @Query(GitFileStatusQuerySchema) query: GitFileStatusQuery,
  ): Promise<{ map: GitFileStatusMap; truncated: boolean }> {
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
    @Query(GitDiffQuerySchema) query: GitDiffQuery,
  ): Promise<GitDiffResponse> {
    return this.getDiff.execute({
      orgId,
      sourceId,
      hostId: query.hostId,
      worktreeId: query.worktreeId,
      path: query.path,
    });
  }

  @Post('add')
  add(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(StageGitBodySchema) body: StageGitBody,
  ): Promise<{ ok: true }> {
    return this.stageGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      paths: body.paths ?? [],
    });
  }

  @Post('commit')
  commit(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(CommitGitBodySchema) body: CommitGitBody,
  ): Promise<{ ok: true }> {
    return this.commitGit.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      worktreeId: body.worktreeId,
      message: body.message,
    });
  }

  @Post('push')
  push(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(HostWorktreeBodySchema) body: HostWorktreeBody,
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
    @Body(HostWorktreeBodySchema) body: HostWorktreeBody,
  ): Promise<{ ok: true }> {
    return this.pullGit.execute({
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
    @Body(CheckoutGitBodySchema) body: CheckoutGitBody,
  ): Promise<{ ok: true }> {
    return this.checkoutGit.execute({
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
    @Body(CreateGitBranchBodySchema) body: CreateGitBranchBody,
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
    @Body(GitHostQuerySchema) body: GitHostQuery,
  ): Promise<{ ok: true }> {
    return this.initGit.execute({ orgId, sourceId, hostId: body.hostId });
  }
}
