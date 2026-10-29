import { Module } from '@harnesys/brix';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ApprovalModule } from '../../infra/approvals/approval.module.ts';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { FileAccessModule } from '../../infra/file-access/file-access.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { IdentitySqliteModule } from '../../infra/identity-sqlite/identity-sqlite.module.ts';
import { IssueInfraModule } from '../../infra/issues/issue.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { ModePresetsModule } from '../../infra/mode-presets/mode-presets.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { SkillsModule } from '../../infra/skills/skills.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { UsageModule } from '../../infra/usage/usage.module.ts';
import { FleetUseCaseModule } from '../fleet/fleet.use-case.module.ts';
import { SkillsUseCaseModule } from '../skills/skills.use-case.module.ts';
import { CancelRunUseCase } from './cancel-run.use-case.ts';
import { CompactThreadUseCase } from './compact-thread.use-case.ts';
import { CreateThreadUseCase } from './create-thread.use-case.ts';
import { DeleteThreadUseCase } from './delete-thread.use-case.ts';
import { DeleteThreadEventUseCase } from './delete-thread-event.use-case.ts';
import { DeleteThreadPlanUseCase } from './delete-thread-plan.use-case.ts';
import { GetThreadUseCase } from './get-thread.use-case.ts';
import { GetThreadAttachmentUseCase } from './get-thread-attachment.use-case.ts';
import { GetThreadPlanUseCase } from './get-thread-plan.use-case.ts';
import { GetThreadRawModelRequestUseCase } from './get-thread-raw-model-request.use-case.ts';
import { ListThreadAttachmentsUseCase } from './list-thread-attachments.use-case.ts';
import { ListThreadFilesUseCase } from './list-thread-files.use-case.ts';
import { ListThreadRawModelRequestsUseCase } from './list-thread-raw-model-requests.use-case.ts';
import { ListThreadsUseCase } from './list-threads.use-case.ts';
import { MarkThreadReadUseCase } from './mark-thread-read.use-case.ts';
import { ReadThreadFileUseCase } from './read-thread-file.use-case.ts';
import { RespondRunUseCase } from './respond-run.use-case.ts';
import { RetryRunUseCase } from './retry-run.use-case.ts';
import { SendThreadRunUseCase } from './send-thread-run.use-case.ts';
import { StreamRunEventsUseCase } from './stream-run-events.use-case.ts';
import { ThreadMessageQueueUseCase } from './thread-message-queue.use-case.ts';
import { TickWaitTimersUseCase } from './tick-wait-timers.use-case.ts';
import { UpdateThreadBindingUseCase } from './update-thread-binding.use-case.ts';
import { UploadThreadAttachmentUseCase } from './upload-thread-attachment.use-case.ts';

const useCases = [
  CreateThreadUseCase,
  ListThreadsUseCase,
  GetThreadUseCase,
  SendThreadRunUseCase,
  CancelRunUseCase,
  CompactThreadUseCase,
  MarkThreadReadUseCase,
  GetThreadPlanUseCase,
  DeleteThreadPlanUseCase,
  RespondRunUseCase,
  RetryRunUseCase,
  StreamRunEventsUseCase,
  DeleteThreadUseCase,
  DeleteThreadEventUseCase,
  UpdateThreadBindingUseCase,
  TickWaitTimersUseCase,
  UploadThreadAttachmentUseCase,
  ListThreadAttachmentsUseCase,
  ListThreadFilesUseCase,
  ReadThreadFileUseCase,
  ListThreadRawModelRequestsUseCase,
  GetThreadRawModelRequestUseCase,
  GetThreadAttachmentUseCase,
  ThreadMessageQueueUseCase,
];

@Module({
  imports: [
    ThreadModule,
    AgentModule,
    ApprovalModule,
    ModePresetsModule,
    RuntimeModule,
    SourceModule,
    ExecutionProfileModule,
    MachineHomeModule,
    FileAccessModule,
    FleetHubModule,
    FleetUseCaseModule,
    IdentitySqliteModule,
    SkillsModule,
    SkillsUseCaseModule,
    IssueInfraModule,
    UsageModule,
  ],
  providers: [...useCases],
  exports: [...useCases],
})
export class ThreadUseCaseModule {}
