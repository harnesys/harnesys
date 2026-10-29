import { Module } from '@harnesys/brix';
import { WebhookRepositoryPort } from '../../domain/webhook/webhook-repository.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { WebhookRepositoryAdapter } from './webhook-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: WebhookRepositoryPort, useClass: WebhookRepositoryAdapter }],
  exports: [WebhookRepositoryPort],
})
export class WebhookModule {}
