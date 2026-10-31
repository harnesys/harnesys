import { Module } from '@harnesys/brix';
import { PermissionRuleStorePort } from '../../domain/permissions/permission-rule-store.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { PermissionRuleStoreAdapter } from './permission-rule-store.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: PermissionRuleStorePort, useClass: PermissionRuleStoreAdapter }],
  exports: [PermissionRuleStorePort],
})
export class PermissionsModule {}
