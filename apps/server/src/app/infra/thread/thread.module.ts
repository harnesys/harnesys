import { Module } from '@harnesys/brix';
import { ThreadUseCaseModule } from '../../application/threads/thread.use-case.module.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadExportReaderPort } from '../../domain/thread/thread-export-reader.port.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { TriggerWorkspacePort } from '../../domain/thread/trigger-workspace.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AttachmentRepositoryAdapter } from './attachment-repository.adapter.ts';
import { AttachmentStorageAdapter } from './attachment-storage.adapter.ts';
import { ThreadAgentRepositoryAdapter } from './thread-agent-repository.adapter.ts';
import { ThreadEventsAdapter } from './thread-events.adapter.ts';
import { ThreadExportReaderAdapter } from './thread-export-reader.adapter.ts';
import { ThreadHistoryPageAdapter } from './thread-history-page.adapter.ts';
import { ThreadParticipantRepositoryAdapter } from './thread-participant-repository.adapter.ts';
import { ThreadRepositoryAdapter } from './thread-repository.adapter.ts';
import { TriggerWorkspaceAdapter } from './trigger-workspace.adapter.ts';

@Module({
  global: true,
  imports: [ThreadUseCaseModule, MachineHomeModule],
  providers: [
    { provide: ThreadRepositoryPort, useClass: ThreadRepositoryAdapter },
    { provide: ThreadAgentRepositoryPort, useClass: ThreadAgentRepositoryAdapter },
    { provide: ThreadParticipantRepositoryPort, useClass: ThreadParticipantRepositoryAdapter },
    { provide: AttachmentRepositoryPort, useClass: AttachmentRepositoryAdapter },
    { provide: AttachmentStoragePort, useClass: AttachmentStorageAdapter },
    { provide: ThreadEventsPort, useClass: ThreadEventsAdapter },
    { provide: ThreadExportReaderPort, useClass: ThreadExportReaderAdapter },
    { provide: ThreadHistoryPagePort, useClass: ThreadHistoryPageAdapter },
    { provide: TriggerWorkspacePort, useClass: TriggerWorkspaceAdapter },
  ],
  exports: [
    ThreadRepositoryPort,
    ThreadAgentRepositoryPort,
    ThreadParticipantRepositoryPort,
    AttachmentRepositoryPort,
    AttachmentStoragePort,
    ThreadEventsPort,
    ThreadExportReaderPort,
    ThreadHistoryPagePort,
    TriggerWorkspacePort,
  ],
})
export class ThreadModule {}
