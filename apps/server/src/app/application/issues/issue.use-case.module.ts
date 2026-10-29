import { Module } from '@harnesys/brix';
import { IssueFirePort } from '../../domain/issue/issue-fire.port.ts';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ExecutionProfileModule } from '../../infra/execution-profile/execution-profile.module.ts';
import { FleetHubModule } from '../../infra/fleet-hub/fleet-hub.module.ts';
import { IssueInfraModule } from '../../infra/issues/issue.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { SourceUseCaseModule } from '../source/source.use-case.module.ts';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
import { AddBoardStatusUseCase } from './add-board-status.use-case.ts';
import { AddIssueCommentUseCase } from './add-issue-comment.use-case.ts';
import { AddIssueDependencyUseCase } from './add-issue-dependency.use-case.ts';
import { AddIssueSourceAttachmentUseCase } from './add-issue-source-attachment.use-case.ts';
import { CreateIssueUseCase } from './create-issue.use-case.ts';
import { CreateIssueBoardUseCase } from './create-issue-board.use-case.ts';
import { CreateIssueLabelUseCase } from './create-issue-label.use-case.ts';
import { CreateIssueWorktreeUseCase } from './create-issue-worktree.use-case.ts';
import { DeleteIssueUseCase } from './delete-issue.use-case.ts';
import { DeleteIssueAttachmentUseCase } from './delete-issue-attachment.use-case.ts';
import { DeleteIssueBoardUseCase } from './delete-issue-board.use-case.ts';
import { DeleteIssueLabelUseCase } from './delete-issue-label.use-case.ts';
import { FireIssueUseCase } from './fire-issue.use-case.ts';
import { GetIssueUseCase } from './get-issue.use-case.ts';
import { GetIssueAttachmentUseCase } from './get-issue-attachment.use-case.ts';
import { GetIssueBoardUseCase } from './get-issue-board.use-case.ts';
import { IssueFireBinding } from './issue-fire.binding.ts';
import { IssueToolsProvider } from './issue-tools.provider.ts';
import { ListIssueBoardsUseCase } from './list-issue-boards.use-case.ts';
import { ListIssueCommentsUseCase } from './list-issue-comments.use-case.ts';
import { ListIssueLabelsUseCase } from './list-issue-labels.use-case.ts';
import { ListIssuesUseCase } from './list-issues.use-case.ts';
import { NudgeIssueUseCase } from './nudge-issue.use-case.ts';
import { RemoveBoardRuleUseCase } from './remove-board-rule.use-case.ts';
import { RemoveBoardStatusUseCase } from './remove-board-status.use-case.ts';
import { RemoveIssueDependencyUseCase } from './remove-issue-dependency.use-case.ts';
import { ReorderBoardRulesUseCase } from './reorder-board-rules.use-case.ts';
import { ReorderBoardStatusesUseCase } from './reorder-board-statuses.use-case.ts';
import { SaveBoardRuleUseCase } from './save-board-rule.use-case.ts';
import { SetIssueBoardArchiveUseCase } from './set-issue-board-archive.use-case.ts';
import { UpdateBoardStatusUseCase } from './update-board-status.use-case.ts';
import { UpdateIssueUseCase } from './update-issue.use-case.ts';
import { UpdateIssueBoardUseCase } from './update-issue-board.use-case.ts';
import { UpdateIssueLabelUseCase } from './update-issue-label.use-case.ts';
import { UpdateIssueStatusUseCase } from './update-issue-status.use-case.ts';
import { UploadIssueAttachmentUseCase } from './upload-issue-attachment.use-case.ts';

const useCases = [
  CreateIssueBoardUseCase,
  ListIssueBoardsUseCase,
  GetIssueBoardUseCase,
  UpdateIssueBoardUseCase,
  AddBoardStatusUseCase,
  UpdateBoardStatusUseCase,
  RemoveBoardStatusUseCase,
  ReorderBoardStatusesUseCase,
  SaveBoardRuleUseCase,
  RemoveBoardRuleUseCase,
  ReorderBoardRulesUseCase,
  SetIssueBoardArchiveUseCase,
  DeleteIssueBoardUseCase,
  CreateIssueUseCase,
  ListIssuesUseCase,
  GetIssueUseCase,
  UpdateIssueUseCase,
  UpdateIssueStatusUseCase,
  DeleteIssueUseCase,
  AddIssueCommentUseCase,
  ListIssueCommentsUseCase,
  AddIssueDependencyUseCase,
  RemoveIssueDependencyUseCase,
  UploadIssueAttachmentUseCase,
  AddIssueSourceAttachmentUseCase,
  GetIssueAttachmentUseCase,
  DeleteIssueAttachmentUseCase,
  CreateIssueLabelUseCase,
  ListIssueLabelsUseCase,
  UpdateIssueLabelUseCase,
  DeleteIssueLabelUseCase,
  NudgeIssueUseCase,
  CreateIssueWorktreeUseCase,
];

@Module({
  imports: [
    IssueInfraModule,
    AgentModule,
    ExecutionProfileModule,
    FleetHubModule,
    MachineHomeModule,
    SourceModule,
    SourceUseCaseModule,
    ThreadModule,
    ThreadUseCaseModule,
  ],
  providers: [
    FireIssueUseCase,
    { provide: IssueFirePort, useClass: IssueFireBinding },
    IssueToolsProvider,
    ...useCases,
  ],
  exports: [IssueFirePort, ...useCases],
})
export class IssueUseCaseModule {}
