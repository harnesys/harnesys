import { Module } from '@harnesys/brix';
import { GenerateImageUseCase } from './generate-image.use-case.ts';

@Module({
  providers: [GenerateImageUseCase],
  exports: [GenerateImageUseCase],
})
export class ImageUseCaseModule {}
