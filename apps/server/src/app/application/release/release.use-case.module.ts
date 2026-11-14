import { Module } from '@harnesys/brix';
import { ReleaseCheckUseCase } from './release-check.use-case.ts';

@Module({
  providers: [ReleaseCheckUseCase],
  exports: [ReleaseCheckUseCase],
})
export class ReleaseUseCaseModule {}
