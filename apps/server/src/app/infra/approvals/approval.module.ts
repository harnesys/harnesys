import { Module } from '@harnesys/brix';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PermissionsModule } from '../permissions/permissions.module.ts';
import { ApprovalEventsAdapter } from './approval-events.adapter.ts';
import { ApprovalStoreAdapter } from './approval-store.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, PermissionsModule],
  providers: [
    { provide: ApprovalStorePort, useClass: ApprovalStoreAdapter },
    { provide: ApprovalEventsPort, useClass: ApprovalEventsAdapter },
  ],
  exports: [ApprovalStorePort, PermissionRuleStorePort, ApprovalEventsPort],
})
export class ApprovalModule {}
