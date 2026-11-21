import { Module } from '@harnesys/brix';
import { GetToolchainDiscoveryUseCase } from './get-toolchain-discovery.use-case.ts';
import { InstallNodeVersionUseCase } from './install-node-version.use-case.ts';
import { RefreshToolchainUseCase } from './refresh-toolchain.use-case.ts';

const useCases = [GetToolchainDiscoveryUseCase, InstallNodeVersionUseCase, RefreshToolchainUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class ToolchainUseCaseModule {}
