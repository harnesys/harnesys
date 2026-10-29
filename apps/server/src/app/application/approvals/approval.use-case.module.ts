import { Module } from '@harnesys/brix';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ApprovalModule } from '../../infra/approvals/approval.module.ts';
import { FileAccessModule } from '../../infra/file-access/file-access.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { ModePresetsModule } from '../../infra/mode-presets/mode-presets.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { DecideApprovalUseCase } from './decide-approval.use-case.ts';
import { GetApprovalUseCase } from './get-approval.use-case.ts';
import { ListApprovalsUseCase } from './list-approvals.use-case.ts';
import { RequestApprovalUseCase } from './request-approval.use-case.ts';

const useCases = [
  RequestApprovalUseCase,
  ListApprovalsUseCase,
  GetApprovalUseCase,
  DecideApprovalUseCase,
];

@Module({
  imports: [
    ApprovalModule,
    AgentModule,
    ModePresetsModule,
    MachineHomeModule,
    FileAccessModule,
    RuntimeModule,
    FleetHubModule,
    SourceModule,
  ],
  providers: [...useCases],
  exports: [...useCases, ApprovalEventsPort],
})
export class ApprovalUseCaseModule {}
