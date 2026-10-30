import { Module } from '@harnesys/brix';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { CreateProviderUseCase } from './create-provider.use-case.ts';
import { CreateProviderModelUseCase } from './create-provider-model.use-case.ts';
import { DeleteProviderUseCase } from './delete-provider.use-case.ts';
import { DeleteProviderModelUseCase } from './delete-provider-model.use-case.ts';
import { DiscoverProviderModelsUseCase } from './discover-provider-models.use-case.ts';
import { ExportProvidersUseCase } from './export-providers.use-case.ts';
import { GetProviderUseCase } from './get-provider.use-case.ts';
import { ImportProvidersUseCase } from './import-providers.use-case.ts';
import { ListProvidersUseCase } from './list-providers.use-case.ts';
import { OllamaModelInfoUseCase } from './ollama-model-info.use-case.ts';
import { ProviderKeys } from './provider-keys.ts';
import { UpdateProviderUseCase } from './update-provider.use-case.ts';
import { UpdateProviderModelUseCase } from './update-provider-model.use-case.ts';

const useCases = [
  ListProvidersUseCase,
  GetProviderUseCase,
  CreateProviderUseCase,
  UpdateProviderUseCase,
  DeleteProviderUseCase,
  ExportProvidersUseCase,
  ImportProvidersUseCase,
  DiscoverProviderModelsUseCase,
  CreateProviderModelUseCase,
  UpdateProviderModelUseCase,
  DeleteProviderModelUseCase,
  OllamaModelInfoUseCase,
];

@Module({
  imports: [ProviderModule, SecretModule],
  providers: [ProviderKeys, ...useCases],
  exports: [...useCases],
})
export class ProviderUseCaseModule {}
