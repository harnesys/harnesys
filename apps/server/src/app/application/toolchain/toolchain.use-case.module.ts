import { Module } from '@harnesys/brix';
import { LspModule } from '../../infra/lsp/lsp.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { GetToolchainDiscoveryUseCase } from './get-toolchain-discovery.use-case.ts';
import { RefreshToolchainUseCase } from './refresh-toolchain.use-case.ts';

const useCases = [GetToolchainDiscoveryUseCase, RefreshToolchainUseCase];

@Module({
  imports: [MachineHomeModule, LspModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ToolchainUseCaseModule {}
