import { Module } from '@harnesys/brix';
import { HookRunStorePort } from '../../domain/agent/hook-run-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { HookRunAdapter } from '../org-sqlite/hook-run.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: HookRunStorePort, useClass: HookRunAdapter }],
  exports: [HookRunStorePort],
})
export class HookRunModule {}
