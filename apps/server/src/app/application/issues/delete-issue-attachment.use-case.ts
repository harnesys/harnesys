import { Injectable } from '@harnesys/brix';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueAttachmentNotFoundException } from '../../domain/issue/issue.error.ts';
import { issueDir } from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { loadActiveIssue } from './issue-guards.ts';

export interface DeleteIssueAttachmentRequest {
  orgId: string;
  issueId: string;
  attachmentId: string;
}

@Injectable()
export class DeleteIssueAttachmentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: DeleteIssueAttachmentRequest): Promise<void> {
    const issue = loadActiveIssue(this.issues, this.boards, request.orgId, request.issueId);
    const record = this.attachments.findById(request.orgId, issue.id, request.attachmentId);
    if (!record) {
      throw new IssueAttachmentNotFoundException(request.attachmentId);
    }
    if (record.kind === 'file' && record.path) {
      await this.storage.removeOne(issueDir(this.layout, request.orgId, issue.id), record.id);
    }
    this.attachments.delete(request.orgId, issue.id, record.id);
  }
}
