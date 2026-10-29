import { Module } from '@harnesys/brix';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueCommentRepositoryPort } from '../../domain/issue/issue-comment-repository.port.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { IssueExecutionAdapter } from '../org-sqlite/issue-execution.adapter.ts';
import { IssueBoardRepositoryAdapter } from './board-repository.adapter.ts';
import { IssueAttachmentRepositoryAdapter } from './issue-attachment-repository.adapter.ts';
import { IssueAttachmentStorageAdapter } from './issue-attachment-storage.adapter.ts';
import { IssueCommentRepositoryAdapter } from './issue-comment-repository.adapter.ts';
import { IssueDependencyRepositoryAdapter } from './issue-dependency-repository.adapter.ts';
import { IssueEventsAdapter } from './issue-events.adapter.ts';
import { IssueRepositoryAdapter } from './issue-repository.adapter.ts';
import { IssueLabelRepositoryAdapter } from './label-repository.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: IssueRepositoryPort, useClass: IssueRepositoryAdapter },
    { provide: IssueBoardRepositoryPort, useClass: IssueBoardRepositoryAdapter },
    { provide: IssueLabelRepositoryPort, useClass: IssueLabelRepositoryAdapter },
    { provide: IssueCommentRepositoryPort, useClass: IssueCommentRepositoryAdapter },
    { provide: IssueDependencyRepositoryPort, useClass: IssueDependencyRepositoryAdapter },
    { provide: IssueAttachmentRepositoryPort, useClass: IssueAttachmentRepositoryAdapter },
    { provide: IssueAttachmentStoragePort, useClass: IssueAttachmentStorageAdapter },
    { provide: IssueEventsPort, useClass: IssueEventsAdapter },
    { provide: IssueExecutionPort, useClass: IssueExecutionAdapter },
  ],
  exports: [
    IssueRepositoryPort,
    IssueBoardRepositoryPort,
    IssueLabelRepositoryPort,
    IssueCommentRepositoryPort,
    IssueDependencyRepositoryPort,
    IssueAttachmentRepositoryPort,
    IssueAttachmentStoragePort,
    IssueEventsPort,
    IssueExecutionPort,
  ],
})
export class IssueInfraModule {}
