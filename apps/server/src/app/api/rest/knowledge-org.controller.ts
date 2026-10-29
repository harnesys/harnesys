import { Controller, Get, Param } from '@harnesys/brix';
import type { KnowledgeIndexState } from '@harnesys/studio-shared';
import { ListKnowledgeIndexStatesUseCase } from '../../application/knowledge/list-knowledge-index-states.use-case.ts';

@Controller('orgs/:orgId/knowledge')
export class KnowledgeOrgController {
  constructor(private readonly listIndexStates: ListKnowledgeIndexStatesUseCase) {}

  @Get('index-states')
  indexStates(@Param('orgId') orgId: string): KnowledgeIndexState[] {
    return this.listIndexStates.execute({ orgId });
  }
}
