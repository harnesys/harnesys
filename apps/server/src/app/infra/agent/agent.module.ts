import { Module } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { DeskModule } from '../desk/desk.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AgentRegistryAdapter } from './agent-registry.adapter.ts';

@Module({
  imports: [MachineHomeModule, DeskModule],
  providers: [{ provide: AgentRegistryPort, useClass: AgentRegistryAdapter }],
  exports: [AgentRegistryPort],
})
export class AgentModule {}
