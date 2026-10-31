import { Module } from '@harnesys/brix';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { PermissionGrantStorePort } from '../../domain/approval/permission-grant-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ApprovalEventsAdapter } from './approval-events.adapter.ts';
import { ApprovalStoreAdapter } from './approval-store.adapter.ts';
import { PermissionGrantStoreAdapter } from './permission-grant-store.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: ApprovalStorePort, useClass: ApprovalStoreAdapter },
    { provide: PermissionGrantStorePort, useClass: PermissionGrantStoreAdapter },
    { provide: ApprovalEventsPort, useClass: ApprovalEventsAdapter },
  ],
  exports: [ApprovalStorePort, PermissionGrantStorePort, ApprovalEventsPort],
})
export class ApprovalModule {}
