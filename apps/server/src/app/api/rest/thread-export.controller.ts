import { Controller, Get, Param } from '@harnesys/brix';
import { ExportThreadUseCase } from '../../application/threads/export-thread.use-case.ts';

@Controller('orgs/:orgId/threads/:threadId/export')
export class ThreadExportController {
  constructor(private readonly exportThread: ExportThreadUseCase) {}

  @Get()
  async download(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
  ): Promise<Response> {
    const { fileName, stream } = await this.exportThread.execute({ orgId, threadId });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }
}
