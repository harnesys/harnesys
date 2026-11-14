import { Module } from '@harnesys/brix';
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
  imports: [ThreadUseCaseModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class WebhookUseCaseModule {}
