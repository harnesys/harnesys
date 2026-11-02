import { Module } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';
import { ToolchainModule } from '../toolchain/toolchain.module.ts';
import { LspAdapter } from './lsp.adapter.ts';

@Module({
  imports: [PluginsModule, MachineHomeModule, ToolchainModule],
  providers: [{ provide: LspPort, useClass: LspAdapter }],
  exports: [LspPort, ToolchainPort],
})
export class LspModule {}
