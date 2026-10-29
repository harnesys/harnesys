import { Module } from '@harnesys/brix';
import { FileAccessRulePort } from '../../domain/file-access/file-access-rule.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { FileAccessRuleAdapter } from './file-access-rule.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: FileAccessRulePort, useClass: FileAccessRuleAdapter }],
  exports: [FileAccessRulePort],
})
export class FileAccessModule {}
