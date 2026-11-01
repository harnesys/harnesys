import { Module } from '@harnesys/brix';
import { EulaInfraModule } from '../../infra/eula/eula.module.ts';
import { AcceptEulaUseCase } from './accept-eula.use-case.ts';
import { GetEulaStatusUseCase } from './get-eula-status.use-case.ts';

const EULA_USE_CASES = [GetEulaStatusUseCase, AcceptEulaUseCase];

@Module({
  imports: [EulaInfraModule],
  providers: [...EULA_USE_CASES],
  exports: [...EULA_USE_CASES],
})
export class EulaUseCaseModule {}
