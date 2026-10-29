import { Injectable } from '@harnesys/brix';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import { issueDir } from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { DeleteThreadUseCase } from '../threads/delete-thread.use-case.ts';

export interface DeleteIssueRequest {
  orgId: string;
  issueId: string;
}

@Injectable()
export class DeleteIssueUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
    private readonly events: IssueEventsPort,
    private readonly deleteThread: DeleteThreadUseCase,
  ) {}

  async execute(request: DeleteIssueRequest): Promise<void> {
    const issue = this.issues.findById(request.orgId, request.issueId);
    if (!issue) {
      throw new IssueNotFoundException(request.issueId);
    }
    await this.deleteThread.deleteByIssue(request.orgId, issue.id);
    await this.storage.removeAll(issueDir(this.layout, request.orgId, issue.id));
    this.issues.delete(request.orgId, issue.id);
    this.events.emit(request.orgId, {
      type: 'issue-deleted',
      issueId: issue.id,
      boardId: issue.boardId,
    });
  }
}
