import { Injectable } from '@harnesys/brix';
import type { IssueAttachmentPublic } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import { issueDir, MAX_ISSUE_ATTACHMENT_BYTES } from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { kindFromMediaType, sanitizeFileName } from '../../domain/thread/attachment.ts';
import { loadActiveIssue } from './issue-guards.ts';
import { toAttachmentPublic } from './issue-mappers.ts';

export interface UploadIssueAttachmentRequest {
  orgId: string;
  issueId: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

@Injectable()
export class UploadIssueAttachmentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: UploadIssueAttachmentRequest): Promise<IssueAttachmentPublic> {
    const issue = loadActiveIssue(this.issues, this.boards, request.orgId, request.issueId);
    if (request.bytes.byteLength === 0) {
      throw new IssueValidationException('attachment is empty');
    }
    if (request.bytes.byteLength > MAX_ISSUE_ATTACHMENT_BYTES) {
      throw new IssueValidationException('attachment exceeds the size limit');
    }
    const id = crypto.randomUUID();
    const fileName = sanitizeFileName(request.name);
    const relPath = await this.storage.write(
      issueDir(this.layout, request.orgId, issue.id),
      id,
      fileName,
      request.bytes,
    );
    const record = this.attachments.insert({
      id,
      orgId: request.orgId,
      issueId: issue.id,
      kind: 'file',
      name: fileName,
      mediaType: request.mediaType,
      kindMedia: kindFromMediaType(request.mediaType),
      sizeBytes: request.bytes.byteLength,
      path: relPath,
      sourceId: null,
      sourcePath: null,
      createdAt: new Date().toISOString(),
    });
    return toAttachmentPublic(record);
  }
}
