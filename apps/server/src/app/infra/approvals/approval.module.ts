import { Module } from '@harnesys/brix';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ApprovalEventsAdapter } from './approval-events.adapter.ts';
import { ApprovalStoreAdapter } from './approval-store.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: ApprovalStorePort, useClass: ApprovalStoreAdapter },
    { provide: ApprovalEventsPort, useClass: ApprovalEventsAdapter },
  ],
  exports: [ApprovalStorePort, ApprovalEventsPort],
})
export class ApprovalModule {}
