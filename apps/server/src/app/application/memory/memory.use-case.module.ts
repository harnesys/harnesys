import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { AgentMemoryModule } from '../../infra/agent-memory/agent-memory.module.ts';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { ApprovePromotionUseCase } from './approve-promotion.use-case.ts';
import { DeletePinUseCase } from './delete-pin.use-case.ts';
import { DeleteSemanticUseCase } from './delete-semantic.use-case.ts';
import { GetMemoryStatusUseCase } from './get-memory-status.use-case.ts';
import { ListPinsUseCase } from './list-pins.use-case.ts';
import { ListPromotionsUseCase } from './list-promotions.use-case.ts';
import { ListSemanticUseCase } from './list-semantic.use-case.ts';
import { RejectPromotionUseCase } from './reject-promotion.use-case.ts';
import { RunMemoryPassUseCase } from './run-memory-pass.use-case.ts';
import { UpdateSemanticUseCase } from './update-semantic.use-case.ts';
import { UpsertMemorySettingsUseCase } from './upsert-memory-settings.use-case.ts';
import { UpsertPinUseCase } from './upsert-pin.use-case.ts';
import { UpsertSemanticUseCase } from './upsert-semantic.use-case.ts';

const useCases = [
  ListPinsUseCase,
  UpsertPinUseCase,
  DeletePinUseCase,
  ListSemanticUseCase,
  UpsertSemanticUseCase,
  UpdateSemanticUseCase,
  DeleteSemanticUseCase,
  GetMemoryStatusUseCase,
  UpsertMemorySettingsUseCase,
  RunMemoryPassUseCase,
  ListPromotionsUseCase,
  ApprovePromotionUseCase,
  RejectPromotionUseCase,
];

@Module({
  imports: [AgentMemoryModule, AgentModule, ProviderModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class MemoryUseCaseModule {}
