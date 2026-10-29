import { Module } from '@harnesys/brix';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AttachmentRepositoryAdapter } from './attachment-repository.adapter.ts';
import { AttachmentStorageAdapter } from './attachment-storage.adapter.ts';
import { ThreadEventsAdapter } from './thread-events.adapter.ts';
import { ThreadRepositoryAdapter } from './thread-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: ThreadRepositoryPort, useClass: ThreadRepositoryAdapter },
    { provide: AttachmentRepositoryPort, useClass: AttachmentRepositoryAdapter },
    { provide: AttachmentStoragePort, useClass: AttachmentStorageAdapter },
    { provide: ThreadEventsPort, useClass: ThreadEventsAdapter },
  ],
  exports: [
    ThreadRepositoryPort,
    AttachmentRepositoryPort,
    AttachmentStoragePort,
    ThreadEventsPort,
  ],
})
export class ThreadModule {}
