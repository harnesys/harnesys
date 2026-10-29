import { Injectable } from '@harnesys/brix';
import type { ListIssuesResponse } from '@harnesys/contracts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import { IssueCommentRepositoryPort } from '../../domain/issue/issue-comment-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { toIssuePublic } from './issue-mappers.ts';

export interface ListIssuesRequest {
  orgId: string;
  boardId?: string | null;
}

@Injectable()
export class ListIssuesUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly attachments: IssueAttachmentRepositoryPort,
    private readonly comments: IssueCommentRepositoryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  execute(request: ListIssuesRequest): ListIssuesResponse {
    const counts = new Map(
      this.attachments.countsByIssue(request.orgId).map((row) => [row.issueId, row.count]),
    );
    const commentCounts = new Map(
      this.comments.countsByIssue(request.orgId).map((row) => [row.issueId, row.count]),
    );
    const publicDeps = {
      worktrees: this.worktrees,
      layout: this.layout,
      hostId: this.machineConfig.get().id,
    };
    const items = this.issues
      .listByOrg(request.orgId)
      .filter((issue) => (request.boardId ? issue.boardId === request.boardId : true))
      .map((issue) => ({
        ...toIssuePublic(issue, publicDeps),
        attachmentCount: counts.get(issue.id) ?? 0,
        commentCount: commentCounts.get(issue.id) ?? 0,
      }));
    return { items };
  }
}
