import { Module } from '@harnesys/brix';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SqliteLlmModelAdapter } from './sqlite-llm-model.adapter.ts';
import { SqliteLlmProviderAdapter } from './sqlite-llm-provider.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: LlmProviderPort, useClass: SqliteLlmProviderAdapter },
    { provide: LlmModelPort, useClass: SqliteLlmModelAdapter },
  ],
  exports: [LlmProviderPort, LlmModelPort],
})
export class ProviderModule {}
