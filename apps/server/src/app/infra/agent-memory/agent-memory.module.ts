import { Module } from '@harnesys/brix';
import {
  AgentPinStorePort,
  AgentPromotionStorePort,
  AgentSemanticStorePort,
  OrgMemorySettingsPort,
} from '../../domain/agent/agent-memory.port.ts';
import { MemoryCrawlerPort } from '../../domain/agent/memory-crawler.port.ts';
import { AgentModule } from '../agent/agent.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { MemoryCrawler } from '../memory/memory-crawler.ts';
import { ProviderModule } from '../provider/provider.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import {
  AgentMemoryAdapter,
  AgentPromotionAdapter,
  AgentSemanticAdapter,
  OrgMemorySettingsAdapter,
} from './agent-memory.adapter.ts';

@Module({
  global: true,
  imports: [AgentModule, MachineHomeModule, ProviderModule, SecretModule],
  providers: [
    AgentMemoryAdapter,
    AgentSemanticAdapter,
    AgentPromotionAdapter,
    OrgMemorySettingsAdapter,
    MemoryCrawler,
    {
      provide: AgentPinStorePort,
      useFactory: (adapter: AgentMemoryAdapter) => adapter,
      inject: [AgentMemoryAdapter],
    },
    {
      provide: AgentSemanticStorePort,
      useFactory: (adapter: AgentSemanticAdapter) => adapter,
      inject: [AgentSemanticAdapter],
    },
    {
      provide: AgentPromotionStorePort,
      useFactory: (adapter: AgentPromotionAdapter) => adapter,
      inject: [AgentPromotionAdapter],
    },
    {
      provide: OrgMemorySettingsPort,
      useFactory: (adapter: OrgMemorySettingsAdapter) => adapter,
      inject: [OrgMemorySettingsAdapter],
    },
    { provide: MemoryCrawlerPort, useClass: MemoryCrawler },
  ],
  exports: [
    AgentPinStorePort,
    AgentSemanticStorePort,
    AgentPromotionStorePort,
    OrgMemorySettingsPort,
    MemoryCrawler,
    MemoryCrawlerPort,
  ],
})
export class AgentMemoryModule {}
