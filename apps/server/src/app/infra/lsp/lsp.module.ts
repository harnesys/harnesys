import { Module } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PluginsModule } from '../plugins/plugins.module.ts';
import { LspAdapter } from './lsp.adapter.ts';

@Module({
  imports: [PluginsModule, MachineHomeModule],
  providers: [{ provide: LspPort, useClass: LspAdapter }],
  exports: [LspPort],
})
export class LspModule {}
