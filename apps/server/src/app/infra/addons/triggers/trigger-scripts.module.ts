import { Module } from '@harnesys/brix';
import { TriggerScriptProcessPort } from '../../../application/addons/triggers/trigger-script-process.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import { TriggerScriptRunRepositoryAdapter } from '../../org-sqlite/trigger-script-run-repository.adapter.ts';
import { TriggerScriptProcessAdapter } from './trigger-script-process.adapter.ts';

@Module({
  providers: [
    { provide: TriggerScriptProcessPort, useClass: TriggerScriptProcessAdapter },
    { provide: TriggerScriptRunRepositoryPort, useClass: TriggerScriptRunRepositoryAdapter },
  ],
  exports: [TriggerScriptProcessPort, TriggerScriptRunRepositoryPort],
})
export class TriggerScriptsModule {}
