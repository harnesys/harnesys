import { Module } from '@harnesys/brix';
import { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import { KnowledgeModule } from '../../infra/knowledge/knowledge.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { CancelKnowledgeIndexUseCase } from './cancel-knowledge-index.use-case.ts';
import { DeleteKnowledgeRootUseCase } from './delete-knowledge-root.use-case.ts';
import { GetKnowledgeIndexStateUseCase } from './get-knowledge-index-state.use-case.ts';
import { GetKnowledgeSettingsUseCase } from './get-knowledge-settings.use-case.ts';
import { GetKnowledgeStatsUseCase } from './get-knowledge-stats.use-case.ts';
import { ListKnowledgeFilesUseCase } from './list-knowledge-files.use-case.ts';
import { ListKnowledgeIndexStatesUseCase } from './list-knowledge-index-states.use-case.ts';
import { ListKnowledgeRootsUseCase } from './list-knowledge-roots.use-case.ts';
import { PutKnowledgeSettingsUseCase } from './put-knowledge-settings.use-case.ts';
import { ReindexKnowledgeUseCase } from './reindex-knowledge.use-case.ts';
import { SearchKnowledgeUseCase } from './search-knowledge.use-case.ts';
import { UpsertKnowledgeRootUseCase } from './upsert-knowledge-root.use-case.ts';

const useCases = [
  GetKnowledgeSettingsUseCase,
  PutKnowledgeSettingsUseCase,
  ListKnowledgeRootsUseCase,
  UpsertKnowledgeRootUseCase,
  DeleteKnowledgeRootUseCase,
  ListKnowledgeFilesUseCase,
  GetKnowledgeStatsUseCase,
  GetKnowledgeIndexStateUseCase,
  ListKnowledgeIndexStatesUseCase,
  ReindexKnowledgeUseCase,
  CancelKnowledgeIndexUseCase,
  SearchKnowledgeUseCase,
];

@Module({
  imports: [KnowledgeModule, SourceModule],
  providers: [...useCases],
  exports: [...useCases, KnowledgeIndexEventsPort],
})
export class KnowledgeUseCaseModule {}
