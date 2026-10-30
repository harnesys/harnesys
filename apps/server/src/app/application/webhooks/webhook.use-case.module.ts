import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { DeskModule } from '../../infra/desk/desk.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { WebhookModule } from '../../infra/webhooks/webhook.module.ts';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
import { CreateWebhookUseCase } from './create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from './delete-webhook.use-case.ts';
import { FireWebhookUseCase } from './fire-webhook.use-case.ts';
import { ListWebhooksUseCase } from './list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from './update-webhook.use-case.ts';

const useCases = [
  ListWebhooksUseCase,
  CreateWebhookUseCase,
  UpdateWebhookUseCase,
  DeleteWebhookUseCase,
  FireWebhookUseCase,
];

@Module({
  imports: [
    WebhookModule,
    ThreadModule,
    AgentModule,
    ThreadUseCaseModule,
    RuntimeModule,
    DeskModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class WebhookUseCaseModule {}
