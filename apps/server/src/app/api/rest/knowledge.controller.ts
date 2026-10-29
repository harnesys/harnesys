import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@harnesys/brix';
import type {
  KnowledgeFileRecord,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
} from '@harnesys/studio-shared';
import type { KnowledgeHit } from 'harnesys';
import { z } from 'zod';
import { CancelKnowledgeIndexUseCase } from '../../application/knowledge/cancel-knowledge-index.use-case.ts';
import { DeleteKnowledgeRootUseCase } from '../../application/knowledge/delete-knowledge-root.use-case.ts';
import { GetKnowledgeIndexStateUseCase } from '../../application/knowledge/get-knowledge-index-state.use-case.ts';
import { GetKnowledgeSettingsUseCase } from '../../application/knowledge/get-knowledge-settings.use-case.ts';
import { GetKnowledgeStatsUseCase } from '../../application/knowledge/get-knowledge-stats.use-case.ts';
import { ListKnowledgeFilesUseCase } from '../../application/knowledge/list-knowledge-files.use-case.ts';
import { ListKnowledgeRootsUseCase } from '../../application/knowledge/list-knowledge-roots.use-case.ts';
import { PutKnowledgeSettingsUseCase } from '../../application/knowledge/put-knowledge-settings.use-case.ts';
import { ReindexKnowledgeUseCase } from '../../application/knowledge/reindex-knowledge.use-case.ts';
import { SearchKnowledgeUseCase } from '../../application/knowledge/search-knowledge.use-case.ts';
import { UpsertKnowledgeRootUseCase } from '../../application/knowledge/upsert-knowledge-root.use-case.ts';
import {
  listKnowledgeFilesQuery,
  putKnowledgeSettingsBody,
  searchKnowledgeQuery,
  upsertKnowledgeRootBody,
} from './knowledge.body.ts';

const DeleteRootQuerySchema = z.object({
  path: z.string().min(1),
});

@Controller('orgs/:orgId/sources/:sourceId/knowledge')
export class KnowledgeController {
  constructor(
    private readonly getSettings: GetKnowledgeSettingsUseCase,
    private readonly putSettings: PutKnowledgeSettingsUseCase,
    private readonly listRoots: ListKnowledgeRootsUseCase,
    private readonly upsertRoot: UpsertKnowledgeRootUseCase,
    private readonly deleteRoot: DeleteKnowledgeRootUseCase,
    private readonly listFiles: ListKnowledgeFilesUseCase,
    private readonly getStats: GetKnowledgeStatsUseCase,
    private readonly getIndexState: GetKnowledgeIndexStateUseCase,
    private readonly reindex: ReindexKnowledgeUseCase,
    private readonly cancel: CancelKnowledgeIndexUseCase,
    private readonly search: SearchKnowledgeUseCase,
  ) {}

  @Get('settings')
  settings(@Param('orgId') orgId: string, @Param('sourceId') sourceId: string): KnowledgeSettings {
    return this.getSettings.execute({ orgId, sourceId });
  }

  @Put('settings')
  putSettingsHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(putKnowledgeSettingsBody) body: z.infer<typeof putKnowledgeSettingsBody>,
  ): KnowledgeSettings {
    return this.putSettings.execute({ orgId, sourceId, ...body });
  }

  @Get('roots')
  roots(@Param('orgId') orgId: string, @Param('sourceId') sourceId: string): KnowledgeRootRecord[] {
    return this.listRoots.execute({ orgId, sourceId });
  }

  @Put('roots')
  upsertRootHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Body(upsertKnowledgeRootBody) body: z.infer<typeof upsertKnowledgeRootBody>,
  ): KnowledgeRootRecord {
    return this.upsertRoot.execute({
      orgId,
      sourceId,
      path: body.path,
      enabled: body.enabled,
    });
  }

  @Delete('roots')
  @HttpCode(204)
  deleteRootHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(DeleteRootQuerySchema) query: z.infer<typeof DeleteRootQuerySchema>,
  ): void {
    this.deleteRoot.execute({ orgId, sourceId, path: query.path });
  }

  @Get('files')
  files(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(listKnowledgeFilesQuery) query: z.infer<typeof listKnowledgeFilesQuery>,
  ): KnowledgeFileRecord[] {
    return this.listFiles.execute({ orgId, sourceId, status: query.status });
  }

  @Get('stats')
  stats(@Param('orgId') orgId: string, @Param('sourceId') sourceId: string): KnowledgeStats {
    return this.getStats.execute({ orgId, sourceId });
  }

  @Get('index-state')
  indexState(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): KnowledgeIndexState {
    return this.getIndexState.execute({ orgId, sourceId });
  }

  @Post('reindex')
  reindexHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<KnowledgeIndexState> {
    return this.reindex.execute({ orgId, sourceId });
  }

  @Post('cancel')
  cancelHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
  ): KnowledgeIndexState {
    return this.cancel.execute({ orgId, sourceId });
  }

  @Get('search')
  searchHandler(
    @Param('orgId') orgId: string,
    @Param('sourceId') sourceId: string,
    @Query(searchKnowledgeQuery) query: z.infer<typeof searchKnowledgeQuery>,
  ): Promise<KnowledgeHit[]> {
    return this.search.execute({
      orgId,
      sourceId,
      query: query.query,
      limit: query.limit,
    });
  }
}
