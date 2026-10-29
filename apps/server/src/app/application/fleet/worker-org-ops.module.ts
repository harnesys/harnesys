import { Module } from '@harnesys/brix';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { ScheduleUseCaseModule } from '../schedules/schedule.use-case.module.ts';
import { WebhookUseCaseModule } from '../webhooks/webhook.use-case.module.ts';
import { ExecuteWorkerOrgOperationUseCase } from './execute-worker-org-operation.use-case.ts';

@Module({
  imports: [
    FleetHubModule,
    RuntimeModule,
    ThreadModule,
    ScheduleUseCaseModule,
    WebhookUseCaseModule,
  ],
  providers: [ExecuteWorkerOrgOperationUseCase],
  exports: [ExecuteWorkerOrgOperationUseCase],
})
export class WorkerOrgOpsModule {}
