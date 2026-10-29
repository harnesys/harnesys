import { Body, Controller, Delete, Get, Param, Post } from '@harnesys/brix';
import {
  type CreateRepositoryWorktreeBody,
  CreateRepositoryWorktreeBodySchema,
  type DeleteRepositoryWorktreeResponse,
  type ListRepositoryWorktreesResponse,
  type RepositoryWorktree,
} from '@harnesys/contracts';
import { CreateRepositoryWorktreeUseCase } from '../../application/source/create-repository-worktree.use-case.ts';
import { DeleteRepositoryWorktreeUseCase } from '../../application/source/delete-repository-worktree.use-case.ts';
import { ListRepositoryWorktreesUseCase } from '../../application/source/list-repository-worktrees.use-case.ts';

@Controller('orgs/:orgId/sources/:sourceId/worktrees')
export class SourceWorktreesController {
  constructor(
    private readonly listWorktrees: ListRepositoryWorktreesUseCase,
    private readonly createWorktree: CreateRepositoryWorktreeUseCase,
    private readonly deleteWorktree: DeleteRepositoryWorktreeUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<ListRepositoryWorktreesResponse> {
    return this.listWorktrees.execute({ orgId, sourceId });
  }

  @Post()
  create(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(CreateRepositoryWorktreeBodySchema) body: CreateRepositoryWorktreeBody,
  ): Promise<RepositoryWorktree> {
    return this.createWorktree.execute({
      orgId,
      sourceId,
      hostId: body.hostId,
      operationId: body.operationId,
      branch: body.branch,
      createBranch: body.createBranch,
      from: body.from,
    });
  }

  @Delete(':worktreeId')
  remove(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Param('worktreeId') worktreeId: string,
  ): Promise<DeleteRepositoryWorktreeResponse> {
    return this.deleteWorktree.execute({ orgId, sourceId, worktreeId });
  }
}
