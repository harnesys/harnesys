import {
  Body,
  Controller,
  Ctx,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@harnesys/brix';
import type {
  AddIssueCommentBody,
  AddIssueDependencyBody,
  AddIssueSourceAttachmentBody,
  CreateIssueBody,
  CreateIssueResponse,
  CreateIssueWorktreeBody,
  GetIssueResponse,
  IssueAttachmentPublic,
  IssuePublic,
  ListIssueCommentsResponse,
  ListIssuesQuery,
  RepositoryWorktree,
  UpdateIssueBody,
  UpdateIssueStatusBody,
} from '@harnesys/contracts';
import {
  AddIssueCommentBodySchema,
  AddIssueDependencyBodySchema,
  AddIssueSourceAttachmentBodySchema,
  CreateIssueBodySchema,
  CreateIssueWorktreeBodySchema,
  ListIssuesQuerySchema,
  UpdateIssueBodySchema,
  UpdateIssueStatusBodySchema,
} from '@harnesys/contracts';
import type { Context } from 'hono';
import { AddIssueCommentUseCase } from '../../application/issues/add-issue-comment.use-case.ts';
import { AddIssueDependencyUseCase } from '../../application/issues/add-issue-dependency.use-case.ts';
import { AddIssueSourceAttachmentUseCase } from '../../application/issues/add-issue-source-attachment.use-case.ts';
import { CreateIssueUseCase } from '../../application/issues/create-issue.use-case.ts';
import { CreateIssueWorktreeUseCase } from '../../application/issues/create-issue-worktree.use-case.ts';
import { DeleteIssueUseCase } from '../../application/issues/delete-issue.use-case.ts';
import { DeleteIssueAttachmentUseCase } from '../../application/issues/delete-issue-attachment.use-case.ts';
import { GetIssueUseCase } from '../../application/issues/get-issue.use-case.ts';
import { GetIssueAttachmentUseCase } from '../../application/issues/get-issue-attachment.use-case.ts';
import { ListIssueCommentsUseCase } from '../../application/issues/list-issue-comments.use-case.ts';
import { ListIssuesUseCase } from '../../application/issues/list-issues.use-case.ts';
import { NudgeIssueUseCase } from '../../application/issues/nudge-issue.use-case.ts';
import { RemoveIssueDependencyUseCase } from '../../application/issues/remove-issue-dependency.use-case.ts';
import { UpdateIssueUseCase } from '../../application/issues/update-issue.use-case.ts';
import { UpdateIssueStatusUseCase } from '../../application/issues/update-issue-status.use-case.ts';
import { UploadIssueAttachmentUseCase } from '../../application/issues/upload-issue-attachment.use-case.ts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';

@Controller('orgs/:orgId/issues')
export class IssuesController {
  constructor(
    private readonly listIssues: ListIssuesUseCase,
    private readonly createIssue: CreateIssueUseCase,
    private readonly getIssue: GetIssueUseCase,
    private readonly updateIssue: UpdateIssueUseCase,
    private readonly updateStatus: UpdateIssueStatusUseCase,
    private readonly deleteIssue: DeleteIssueUseCase,
    private readonly listComments: ListIssueCommentsUseCase,
    private readonly addComment: AddIssueCommentUseCase,
    private readonly addDependency: AddIssueDependencyUseCase,
    private readonly removeDependency: RemoveIssueDependencyUseCase,
    private readonly uploadAttachment: UploadIssueAttachmentUseCase,
    private readonly addSourceAttachment: AddIssueSourceAttachmentUseCase,
    private readonly getAttachment: GetIssueAttachmentUseCase,
    private readonly deleteAttachment: DeleteIssueAttachmentUseCase,
    private readonly createIssueWorktree: CreateIssueWorktreeUseCase,
    private readonly nudgeIssue: NudgeIssueUseCase,
  ) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query(ListIssuesQuerySchema) query: ListIssuesQuery,
  ): { items: IssuePublic[] } {
    return this.listIssues.execute({ orgId, boardId: query.boardId ?? null });
  }

  @Post()
  @HttpCode(201)
  async create(
    @Param('orgId') orgId: string,
    @Body(CreateIssueBodySchema) body: CreateIssueBody,
  ): Promise<CreateIssueResponse> {
    return this.createIssue.execute({ orgId, body });
  }

  @Get(':issueId')
  get(@Param('orgId') orgId: string, @Param('issueId') issueId: string): GetIssueResponse {
    return this.getIssue.execute({ orgId, issueId });
  }

  @Patch(':issueId')
  update(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(UpdateIssueBodySchema) body: UpdateIssueBody,
  ): { issue: IssuePublic } {
    return { issue: this.updateIssue.execute({ orgId, issueId, body }) };
  }

  @Patch(':issueId/status')
  async updateIssueStatus(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(UpdateIssueStatusBodySchema) body: UpdateIssueStatusBody,
  ): Promise<{ issue: IssuePublic }> {
    return { issue: await this.updateStatus.execute({ orgId, issueId, body }) };
  }

  @Post(':issueId/nudge')
  async nudge(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
  ): Promise<{ issue: IssuePublic }> {
    return { issue: await this.nudgeIssue.execute({ orgId, issueId }) };
  }

  @Post(':issueId/worktree')
  @HttpCode(201)
  createWorktree(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(CreateIssueWorktreeBodySchema) body: CreateIssueWorktreeBody,
  ): Promise<RepositoryWorktree> {
    return this.createIssueWorktree.execute({ orgId, issueId, body });
  }

  @Delete(':issueId')
  @HttpCode(204)
  async remove(@Param('orgId') orgId: string, @Param('issueId') issueId: string): Promise<void> {
    await this.deleteIssue.execute({ orgId, issueId });
  }

  @Get(':issueId/comments')
  listIssueComments(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
  ): ListIssueCommentsResponse {
    return this.listComments.execute(orgId, issueId);
  }

  @Post(':issueId/comments')
  @HttpCode(201)
  addIssueComment(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(AddIssueCommentBodySchema) body: AddIssueCommentBody,
  ): ListIssueCommentsResponse {
    return this.addComment.execute({ orgId, issueId, body });
  }

  @Post(':issueId/dependencies')
  @HttpCode(201)
  addIssueDependency(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(AddIssueDependencyBodySchema) body: AddIssueDependencyBody,
  ): { ok: true } {
    this.addDependency.execute({ orgId, issueId, body });
    return { ok: true };
  }

  @Delete(':issueId/dependencies/:dependsOnIssueId')
  @HttpCode(204)
  removeIssueDependency(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Param('dependsOnIssueId') dependsOnIssueId: string,
  ): void {
    this.removeDependency.execute({ orgId, issueId, dependsOnIssueId });
  }

  @Get(':issueId/attachments')
  listAttachments(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
  ): { items: IssueAttachmentPublic[] } {
    return { items: this.getIssue.execute({ orgId, issueId }).attachments };
  }

  @Post(':issueId/attachments')
  @HttpCode(201)
  async upload(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Ctx() ctx: Context,
  ): Promise<IssueAttachmentPublic> {
    const body = await ctx.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new IssueValidationException('file required');
    }
    return this.uploadAttachment.execute({
      orgId,
      issueId,
      name: file.name || 'file',
      mediaType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  @Post(':issueId/attachments/source')
  @HttpCode(201)
  addSource(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Body(AddIssueSourceAttachmentBodySchema) body: AddIssueSourceAttachmentBody,
  ): IssueAttachmentPublic {
    return this.addSourceAttachment.execute({ orgId, issueId, body });
  }

  @Get(':issueId/attachments/:attachmentId')
  async download(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<Response> {
    const content = await this.getAttachment.execute({ orgId, issueId, attachmentId });
    const fileName = content.name.replaceAll('"', '');
    return new Response(new Uint8Array(content.bytes), {
      headers: {
        'Content-Type': content.mediaType || 'application/octet-stream',
        'Content-Disposition': content.inline ? 'inline' : `attachment; filename="${fileName}"`,
      },
    });
  }

  @Delete(':issueId/attachments/:attachmentId')
  @HttpCode(204)
  async removeAttachment(
    @Param('orgId') orgId: string,
    @Param('issueId') issueId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    await this.deleteAttachment.execute({ orgId, issueId, attachmentId });
  }
}
