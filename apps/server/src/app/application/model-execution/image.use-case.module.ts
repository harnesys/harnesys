import { Module } from '@harnesys/brix';
import { ImageModule } from '../../infra/model-execution/image.module.ts';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { GenerateImageUseCase } from './generate-image.use-case.ts';

@Module({
  imports: [ImageModule, ProviderModule, SecretModule],
  providers: [GenerateImageUseCase],
  exports: [GenerateImageUseCase],
})
export class ImageUseCaseModule {}
