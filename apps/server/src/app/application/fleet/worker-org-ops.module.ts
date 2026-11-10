import { Module } from '@harnesys/brix';
import { ScheduleUseCaseModule } from '../schedules/schedule.use-case.module.ts';
import { WebhookUseCaseModule } from '../webhooks/webhook.use-case.module.ts';
import { ExecuteWorkerOrgOperationUseCase } from './execute-worker-org-operation.use-case.ts';

@Module({
  imports: [ScheduleUseCaseModule, WebhookUseCaseModule],
  providers: [ExecuteWorkerOrgOperationUseCase],
  exports: [ExecuteWorkerOrgOperationUseCase],
})
export class WorkerOrgOpsModule {}
