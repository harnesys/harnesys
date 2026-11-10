import { Module } from '@harnesys/brix';
import { LspInstallPort } from '../../domain/lsp/lsp-install.port.ts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';
import { ToolchainModule } from '../toolchain/toolchain.module.ts';
import { LspAdapter } from './lsp.adapter.ts';
import { LspInstallAdapter } from './lsp-install.adapter.ts';

@Module({
  global: true,
  imports: [PluginsModule, MachineHomeModule, ToolchainModule],
  providers: [
    { provide: LspPort, useClass: LspAdapter },
    { provide: LspInstallPort, useClass: LspInstallAdapter },
  ],
  exports: [LspPort, LspInstallPort, ToolchainPort],
})
export class LspModule {}
