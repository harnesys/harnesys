import { Controller, Ctx, Get, HttpCode, Param, Post } from '@harnesys/brix';
import type { ListThreadAttachmentsResponse, ThreadAttachment } from '@harnesys/contracts';
import type { Context } from 'hono';
import { GetThreadAttachmentUseCase } from '../../application/threads/get-thread-attachment.use-case.ts';
import { ListThreadAttachmentsUseCase } from '../../application/threads/list-thread-attachments.use-case.ts';
import { UploadThreadAttachmentUseCase } from '../../application/threads/upload-thread-attachment.use-case.ts';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { OrgIdFromRequest, OrgIdHeader } from '../org-id.ts';

@Controller('threads')
export class ThreadAttachmentsController {
  constructor(
    private readonly upload: UploadThreadAttachmentUseCase,
    private readonly list: ListThreadAttachmentsUseCase,
    private readonly get: GetThreadAttachmentUseCase,
  ) {}

  @Get(':threadId/attachments')
  listAttachments(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
  ): ListThreadAttachmentsResponse {
    return { items: this.list.execute(orgId, threadId).map(toDto) };
  }

  @Post(':threadId/attachments')
  @HttpCode(201)
  async uploadAttachment(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Ctx() ctx: Context,
  ): Promise<ThreadAttachment> {
    const body = await ctx.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new ThreadValidationException('file required');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta = await this.upload.execute({
      orgId,
      threadId,
      name: file.name || 'file',
      mediaType: file.type || 'application/octet-stream',
      bytes,
    });
    return toDto(meta);
  }

  @Get(':threadId/attachments/:attachmentId')
  async readAttachment(
    @OrgIdFromRequest() orgId: string,
    @Param('threadId') threadId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<Response> {
    const { meta, fileName, bytes } = await this.get.execute({ orgId, threadId, attachmentId });
    const disposition = meta.kind === 'file' ? `attachment; filename="${fileName}"` : 'inline';
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': meta.mediaType || 'application/octet-stream',
        'Content-Disposition': disposition,
      },
    });
  }
}

function toDto(meta: AttachmentRecord): ThreadAttachment {
  return {
    id: meta.id,
    kind: meta.kind,
    name: meta.name,
    mediaType: meta.mediaType,
    path: meta.path,
    sizeBytes: meta.sizeBytes,
    createdAt: meta.createdAt,
  };
}
