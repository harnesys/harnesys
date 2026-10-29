import { Injectable } from '@harnesys/brix';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueBoardNotFoundException } from '../../domain/issue/issue.error.ts';
import { issueDir } from '../../domain/issue/issue-attachment.ts';
import { IssueAttachmentStoragePort } from '../../domain/issue/issue-attachment-storage.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export interface DeleteIssueBoardRequest {
  orgId: string;
  boardId: string;
}

@Injectable()
export class DeleteIssueBoardUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly issues: IssueRepositoryPort,
    private readonly storage: IssueAttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
    private readonly events: IssueEventsPort,
  ) {}

  async execute(request: DeleteIssueBoardRequest): Promise<void> {
    const board = this.boards.findById(request.orgId, request.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(request.boardId);
    }
    for (const issue of this.issues.listByOrg(request.orgId)) {
      if (issue.boardId !== board.id) {
        continue;
      }
      await this.storage.removeAll(issueDir(this.layout, request.orgId, issue.id));
      this.issues.delete(request.orgId, issue.id);
    }
    this.boards.delete(request.orgId, board.id);
    this.events.emit(request.orgId, { type: 'board-deleted', boardId: board.id });
  }
}
