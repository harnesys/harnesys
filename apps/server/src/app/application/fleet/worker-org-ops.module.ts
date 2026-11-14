import { Module } from '@harnesys/brix';
import { ExecuteWorkerOrgOperationUseCase } from './execute-worker-org-operation.use-case.ts';

@Module({
  providers: [ExecuteWorkerOrgOperationUseCase],
  exports: [ExecuteWorkerOrgOperationUseCase],
})
export class WorkerOrgOpsModule {}
