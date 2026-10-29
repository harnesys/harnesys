import { Injectable } from '@harnesys/brix';
import { IssueAttachmentNotFoundException } from '../../domain/issue/issue.error.ts';
import { issueDir } from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export interface GetIssueAttachmentRequest {
  orgId: string;
  issueId: string;
  attachmentId: string;
}

export interface IssueAttachmentContent {
  name: string;
  mediaType: string;
  inline: boolean;
  bytes: Uint8Array;
}

@Injectable()
export class GetIssueAttachmentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: GetIssueAttachmentRequest): Promise<IssueAttachmentContent> {
    const issue = this.issues.findById(request.orgId, request.issueId);
    if (!issue) {
      throw new IssueAttachmentNotFoundException(request.attachmentId);
    }
    const record = this.attachments.findById(request.orgId, issue.id, request.attachmentId);
    if (record?.kind !== 'file' || !record.path) {
      throw new IssueAttachmentNotFoundException(request.attachmentId);
    }
    const bytes = await this.storage.read(
      issueDir(this.layout, request.orgId, issue.id),
      record.path,
    );
    if (!bytes) {
      throw new IssueAttachmentNotFoundException(request.attachmentId);
    }
    return {
      name: record.name,
      mediaType: record.mediaType,
      inline: record.kindMedia !== 'file',
      bytes,
    };
  }
}
