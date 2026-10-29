import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import { setIssueToolsDeps } from '../../infra/runtime/packs/issue-tools.holder.ts';
import type { OrgIssueDeps } from '../../infra/runtime/packs/org-issue.port.ts';
import { ListSourcesUseCase } from '../source/list-sources.use-case.ts';
import { AddIssueCommentUseCase } from './add-issue-comment.use-case.ts';
import { AddIssueDependencyUseCase } from './add-issue-dependency.use-case.ts';
import { AddIssueSourceAttachmentUseCase } from './add-issue-source-attachment.use-case.ts';
import { CreateIssueUseCase } from './create-issue.use-case.ts';
import { CreateIssueBoardUseCase } from './create-issue-board.use-case.ts';
import { CreateIssueLabelUseCase } from './create-issue-label.use-case.ts';
import { DeleteIssueBoardUseCase } from './delete-issue-board.use-case.ts';
import { DeleteIssueLabelUseCase } from './delete-issue-label.use-case.ts';
import { GetIssueUseCase } from './get-issue.use-case.ts';
import { ListIssueBoardsUseCase } from './list-issue-boards.use-case.ts';
import { ListIssueLabelsUseCase } from './list-issue-labels.use-case.ts';
import { ListIssuesUseCase } from './list-issues.use-case.ts';
import { NudgeIssueUseCase } from './nudge-issue.use-case.ts';
import { RemoveBoardRuleUseCase } from './remove-board-rule.use-case.ts';
import { RemoveIssueDependencyUseCase } from './remove-issue-dependency.use-case.ts';
import { SaveBoardRuleUseCase } from './save-board-rule.use-case.ts';
import { UpdateIssueUseCase } from './update-issue.use-case.ts';
import { UpdateIssueBoardUseCase } from './update-issue-board.use-case.ts';
import { UpdateIssueStatusUseCase } from './update-issue-status.use-case.ts';

@Injectable()
export class IssueToolsProvider implements ModuleInitHook {
  constructor(
    private readonly listBoards: ListIssueBoardsUseCase,
    private readonly listSources: ListSourcesUseCase,
    private readonly listIssues: ListIssuesUseCase,
    private readonly getIssue: GetIssueUseCase,
    private readonly createIssue: CreateIssueUseCase,
    private readonly updateIssue: UpdateIssueUseCase,
    private readonly updateStatus: UpdateIssueStatusUseCase,
    private readonly nudgeIssue: NudgeIssueUseCase,
    private readonly addComment: AddIssueCommentUseCase,
    private readonly addDependency: AddIssueDependencyUseCase,
    private readonly removeDependency: RemoveIssueDependencyUseCase,
    private readonly addSourceAttachment: AddIssueSourceAttachmentUseCase,
    private readonly listLabels: ListIssueLabelsUseCase,
    private readonly createLabel: CreateIssueLabelUseCase,
    private readonly createBoard: CreateIssueBoardUseCase,
    private readonly updateBoard: UpdateIssueBoardUseCase,
    private readonly deleteBoard: DeleteIssueBoardUseCase,
    private readonly deleteLabel: DeleteIssueLabelUseCase,
    private readonly saveBoardRule: SaveBoardRuleUseCase,
    private readonly removeBoardRule: RemoveBoardRuleUseCase,
  ) {}

  onModuleInit(): void {
    const deps: OrgIssueDeps = {
      listBoards: this.listBoards,
      listSources: this.listSources,
      listIssues: this.listIssues,
      getIssue: this.getIssue,
      createIssue: this.createIssue,
      updateIssue: this.updateIssue,
      updateStatus: this.updateStatus,
      nudgeIssue: this.nudgeIssue,
      addComment: this.addComment,
      addDependency: this.addDependency,
      removeDependency: this.removeDependency,
      addSourceAttachment: this.addSourceAttachment,
      listLabels: this.listLabels,
      createLabel: this.createLabel,
      createBoard: this.createBoard,
      updateBoard: this.updateBoard,
      deleteBoard: this.deleteBoard,
      deleteLabel: this.deleteLabel,
      saveBoardRule: this.saveBoardRule,
      removeBoardRule: this.removeBoardRule,
    };
    setIssueToolsDeps(deps);
  }
}
