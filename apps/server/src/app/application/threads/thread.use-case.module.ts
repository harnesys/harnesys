import { Module } from '@harnesys/brix';
import { FleetUseCaseModule } from '../fleet/fleet.use-case.module.ts';
import { SkillsUseCaseModule } from '../skills/skills.use-case.module.ts';
import { AddThreadAgentUseCase } from './add-thread-agent.use-case.ts';
import { AddThreadParticipantUseCase } from './add-thread-participant.use-case.ts';
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
import { RemoveThreadAgentUseCase } from './remove-thread-agent.use-case.ts';
import { RemoveThreadParticipantUseCase } from './remove-thread-participant.use-case.ts';
import { RespondRunUseCase } from './respond-run.use-case.ts';
import { RetryRunUseCase } from './retry-run.use-case.ts';
import { SendThreadMessageUseCase } from './send-thread-message.use-case.ts';
import { SendThreadRunUseCase } from './send-thread-run.use-case.ts';
import { StreamRunEventsUseCase } from './stream-run-events.use-case.ts';
import { ThreadMessageQueueUseCase } from './thread-message-queue.use-case.ts';
import { TickWaitTimersUseCase } from './tick-wait-timers.use-case.ts';
import { UpdateThreadBindingUseCase } from './update-thread-binding.use-case.ts';
import { UpdateThreadPolicyUseCase } from './update-thread-policy.use-case.ts';
import { UploadThreadAttachmentUseCase } from './upload-thread-attachment.use-case.ts';

const useCases = [
  CreateThreadUseCase,
  ListThreadsUseCase,
  GetThreadUseCase,
  SendThreadMessageUseCase,
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
  UpdateThreadPolicyUseCase,
  AddThreadAgentUseCase,
  RemoveThreadAgentUseCase,
  AddThreadParticipantUseCase,
  RemoveThreadParticipantUseCase,
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
  imports: [FleetUseCaseModule, SkillsUseCaseModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ThreadUseCaseModule {}
