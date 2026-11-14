import { Module } from '@harnesys/brix';
import { GetToolchainDiscoveryUseCase } from './get-toolchain-discovery.use-case.ts';
import { RefreshToolchainUseCase } from './refresh-toolchain.use-case.ts';

const useCases = [GetToolchainDiscoveryUseCase, RefreshToolchainUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class ToolchainUseCaseModule {}
