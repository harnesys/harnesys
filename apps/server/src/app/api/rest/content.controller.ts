import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@harnesys/brix';
import {
  type ContentCopyBody,
  ContentCopyBodySchema,
  type ContentCopyResponse,
  type ContentDuplicateResponse,
  type ContentImportBody,
  ContentImportBodySchema,
  type ContentImportResponse,
  type ContentMkdirBody,
  ContentMkdirBodySchema,
  type ContentMoveBody,
  ContentMoveBodySchema,
  type ContentMoveResponse,
  type ContentPathQuery,
  ContentPathQuerySchema,
  type ContentReadMeta,
  type ContentStat,
  type ContentTreeResponse,
  type ContentWriteBody,
  ContentWriteBodySchema,
  type ContentWriteResponse,
} from '@harnesys/contracts';
import { CopyPathsUseCase } from '../../application/content/copy-paths.use-case.ts';
import { DownloadPathUseCase } from '../../application/content/download-path.use-case.ts';
import { DuplicatePathUseCase } from '../../application/content/duplicate-path.use-case.ts';
import { ImportPathsUseCase } from '../../application/content/import-paths.use-case.ts';
import { ListTreeUseCase } from '../../application/content/list-tree.use-case.ts';
import { MkdirUseCase } from '../../application/content/mkdir.use-case.ts';
import { MovePathsUseCase } from '../../application/content/move-paths.use-case.ts';
import { ReadFileUseCase } from '../../application/content/read-file.use-case.ts';
import { RemovePathUseCase } from '../../application/content/remove-path.use-case.ts';
import { RevealPathUseCase } from '../../application/content/reveal-path.use-case.ts';
import { StatPathUseCase } from '../../application/content/stat-path.use-case.ts';
import { WriteFileUseCase } from '../../application/content/write-file.use-case.ts';
import { IfMatchHeader } from '../surface-host.ts';

@Controller('orgs/:orgId/sources/:sourceId/content')
export class ContentController {
  constructor(
    private readonly listTree: ListTreeUseCase,
    private readonly readFile: ReadFileUseCase,
    private readonly writeFile: WriteFileUseCase,
    private readonly mkdir: MkdirUseCase,
    private readonly removePath: RemovePathUseCase,
    private readonly movePaths: MovePathsUseCase,
    private readonly copyPaths: CopyPathsUseCase,
    private readonly importPaths: ImportPathsUseCase,
    private readonly statPath: StatPathUseCase,
    private readonly duplicatePath: DuplicatePathUseCase,
    private readonly revealPath: RevealPathUseCase,
    private readonly downloadPath: DownloadPathUseCase,
  ) {}

  @Get('tree')
  tree(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
  ): Promise<ContentTreeResponse> {
    return this.listTree.execute({
      orgId,
      sourceId,
      path: query.path,
      worktreeId: query.worktreeId,
    });
  }

  @Get('read')
  async read(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
  ): Promise<Response> {
    const result = await this.readFile.execute({
      orgId,
      sourceId,
      path: query.path,
      worktreeId: query.worktreeId,
    });
    return jsonWithEtag(result, result.etag);
  }

  @Put('write')
  write(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
    @Body(ContentWriteBodySchema) body: ContentWriteBody,
    @IfMatchHeader() ifMatch: string | null,
  ): Promise<ContentWriteResponse> {
    return this.writeFile.execute({
      orgId,
      sourceId,
      path: query.path,
      content: body.content,
      encoding: body.encoding,
      ifMatch,
      worktreeId: query.worktreeId,
    });
  }

  @Post('mkdir')
  @HttpCode(204)
  createDir(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentMkdirBodySchema) body: ContentMkdirBody,
  ): Promise<void> {
    return this.mkdir.execute({ orgId, sourceId, path: body.path, worktreeId: body.worktreeId });
  }

  @Delete('remove')
  @HttpCode(204)
  remove(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
  ): Promise<void> {
    return this.removePath.execute({
      orgId,
      sourceId,
      path: query.path,
      worktreeId: query.worktreeId,
    });
  }

  @Post('move')
  move(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentMoveBodySchema) body: ContentMoveBody,
  ): Promise<ContentMoveResponse> {
    return this.movePaths.execute({
      orgId,
      sourceId,
      items: body.items,
      worktreeId: body.worktreeId,
    });
  }

  @Post('copy')
  copy(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentCopyBodySchema) body: ContentCopyBody,
  ): Promise<ContentCopyResponse> {
    return this.copyPaths.execute({
      orgId,
      sourceId,
      items: body.items,
      worktreeId: body.worktreeId,
    });
  }

  @Post('import')
  importFromClipboard(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentImportBodySchema) body: ContentImportBody,
  ): Promise<ContentImportResponse> {
    return this.importPaths.execute({
      orgId,
      sourceId,
      items: body.items,
      worktreeId: body.worktreeId,
    });
  }

  @Get('stat')
  stat(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
  ): Promise<ContentStat> {
    return this.statPath.execute({
      orgId,
      sourceId,
      path: query.path,
      worktreeId: query.worktreeId,
    });
  }

  @Post('duplicate')
  async duplicate(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentMkdirBodySchema) body: ContentMkdirBody,
  ): Promise<ContentDuplicateResponse> {
    const stat = await this.duplicatePath.execute({
      orgId,
      sourceId,
      path: body.path,
      worktreeId: body.worktreeId,
    });
    return { path: stat.path };
  }

  @Post('reveal')
  @HttpCode(204)
  reveal(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(ContentMkdirBodySchema) body: ContentMkdirBody,
  ): Promise<void> {
    return this.revealPath.execute({
      orgId,
      sourceId,
      path: body.path,
      worktreeId: body.worktreeId,
    });
  }

  @Get('download')
  async download(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(ContentPathQuerySchema) query: ContentPathQuery,
  ): Promise<Response> {
    const result = await this.downloadPath.execute({
      orgId,
      sourceId,
      path: query.path,
      worktreeId: query.worktreeId,
    });
    const contentType = result.name.endsWith('.zip')
      ? 'application/zip'
      : 'application/octet-stream';
    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.name)}"`,
      },
    });
  }
}

function jsonWithEtag(body: ContentReadMeta, etag: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ETag: etag,
    },
  });
}
