import { Module } from '@harnesys/brix';
import { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import { KnowledgeIndexerPort } from '../../domain/knowledge/knowledge-indexer.port.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { FilesWatcherModule } from '../files-watcher/files-watcher.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ProviderModule } from '../provider/provider.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { SourceModule } from '../source/source.module.ts';
import { KnowledgeAdapter } from './knowledge.adapter.ts';
import { KnowledgeIndexEventsAdapter } from './knowledge-index-events.adapter.ts';

@Module({
  imports: [MachineHomeModule, SourceModule, ProviderModule, SecretModule, FilesWatcherModule],
  providers: [
    {
      provide: KnowledgeIndexEventsPort,
      useClass: KnowledgeIndexEventsAdapter,
    },
    KnowledgeAdapter,
    {
      provide: KnowledgeStorePort,
      useFactory: (adapter: KnowledgeAdapter) => adapter,
      inject: [KnowledgeAdapter],
    },
    {
      provide: KnowledgeIndexerPort,
      useFactory: (adapter: KnowledgeAdapter) => adapter,
      inject: [KnowledgeAdapter],
    },
    {
      provide: KnowledgeSearchPort,
      useFactory: (adapter: KnowledgeAdapter) => adapter,
      inject: [KnowledgeAdapter],
    },
  ],
  exports: [
    KnowledgeStorePort,
    KnowledgeIndexerPort,
    KnowledgeSearchPort,
    KnowledgeIndexEventsPort,
  ],
})
export class KnowledgeModule {}
