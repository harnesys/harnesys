import { Controller, Get, Param, Query } from '@harnesys/brix';
import {
  type ThreadFilePathQuery,
  ThreadFilePathQuerySchema,
  type ThreadFilesQuery,
  ThreadFilesQuerySchema,
  type ThreadFilesTreeResponse,
} from '@harnesys/contracts';
import { ListThreadFilesUseCase } from '../../application/threads/list-thread-files.use-case.ts';
import { ReadThreadFileUseCase } from '../../application/threads/read-thread-file.use-case.ts';

@Controller('orgs/:orgId/threads/:threadId/files')
export class ThreadFilesController {
  constructor(
    private readonly list: ListThreadFilesUseCase,
    private readonly read: ReadThreadFileUseCase,
  ) {}

  @Get()
  tree(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Query(ThreadFilesQuerySchema) query: ThreadFilesQuery,
  ): Promise<ThreadFilesTreeResponse> {
    return this.list.execute({ orgId, threadId, subPath: query.subPath });
  }

  @Get('content')
  async content(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Query(ThreadFilePathQuerySchema) query: ThreadFilePathQuery,
  ): Promise<Response> {
    const { fileName, mediaType, bytes } = await this.read.execute({
      orgId,
      threadId,
      path: query.path,
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mediaType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  }
}
