import { Controller, Get, Param, Query } from '@harnesys/brix';
import {
  type ContentSearchQuery,
  ContentSearchQuerySchema,
  type ContentSearchResponse,
} from '@harnesys/contracts';
import { SearchContentUseCase } from '../../application/content/search-content.use-case.ts';
import { SurfaceHostIdHeader } from '../surface-host.ts';

@Controller('orgs/:orgId/content')
export class ContentSearchController {
  constructor(private readonly searchContent: SearchContentUseCase) {}

  @Get('search')
  search(
    @Param('orgId') orgId: string,
    @Query(ContentSearchQuerySchema) query: ContentSearchQuery,
    @SurfaceHostIdHeader() surfaceHostId: string | null,
  ): Promise<ContentSearchResponse> {
    return this.searchContent.execute({ orgId, surfaceHostId, query });
  }
}
