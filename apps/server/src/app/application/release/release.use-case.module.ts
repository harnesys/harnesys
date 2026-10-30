import { Module } from '@harnesys/brix';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { ReleaseModule } from '../../infra/release/release.module.ts';
import { ReleaseCheckUseCase } from './release-check.use-case.ts';

@Module({
  imports: [MachineHomeModule, ReleaseModule],
  providers: [ReleaseCheckUseCase],
  exports: [ReleaseCheckUseCase],
})
export class ReleaseUseCaseModule {}
