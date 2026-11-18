import { Body, Controller, Get, Param, Post, Query } from '@harnesys/brix';
import {
  type ContentReplaceBody,
  ContentReplaceBodySchema,
  type ContentReplaceResponse,
  type ContentSearchQuery,
  ContentSearchQuerySchema,
  type ContentSearchResponse,
} from '@harnesys/contracts';
import { ReplaceContentUseCase } from '../../application/content/replace-content.use-case.ts';
import { SearchContentUseCase } from '../../application/content/search-content.use-case.ts';
import { SurfaceHostIdHeader } from '../surface-host.ts';

@Controller('orgs/:orgId/content')
export class ContentSearchController {
  constructor(
    private readonly searchContent: SearchContentUseCase,
    private readonly replaceContent: ReplaceContentUseCase,
  ) {}

  @Get('search')
  search(
    @Param('orgId') orgId: string,
    @Query(ContentSearchQuerySchema) query: ContentSearchQuery,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): Promise<ContentSearchResponse> {
    return this.searchContent.execute({ orgId, surfaceHostId, query });
  }

  @Post('replace')
  replace(
    @Param('orgId') orgId: string,
    @Body(ContentReplaceBodySchema) body: ContentReplaceBody,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): Promise<ContentReplaceResponse> {
    return this.replaceContent.execute({ orgId, surfaceHostId, body });
  }
}
