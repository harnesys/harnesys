import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import type {
  WorkerOrgOperation,
  WorkerOrgOperationBody,
  WorkerOrgOperationResponse,
} from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { WorkerOrgOperationReceiptPort } from '../../domain/fleet/worker-org-operation-receipt.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { issueToolsDeps } from '../../infra/runtime/packs/issue-tools.holder.ts';
import { CreateScheduleUseCase } from '../schedules/create-schedule.use-case.ts';
import { DeleteScheduleUseCase } from '../schedules/delete-schedule.use-case.ts';
import { ListSchedulesUseCase } from '../schedules/list-schedules.use-case.ts';
import { UpdateScheduleUseCase } from '../schedules/update-schedule.use-case.ts';
import { CreateWebhookUseCase } from '../webhooks/create-webhook.use-case.ts';
import { DeleteWebhookUseCase } from '../webhooks/delete-webhook.use-case.ts';
import { ListWebhooksUseCase } from '../webhooks/list-webhooks.use-case.ts';
import { UpdateWebhookUseCase } from '../webhooks/update-webhook.use-case.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface ExecuteWorkerOrgOperationInput {
  orgId: string;
  bearerToken: string;
  body: WorkerOrgOperationBody;
}

@Injectable()
export class ExecuteWorkerOrgOperationUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly claims: EventClaimPort,
    private readonly receipts: WorkerOrgOperationReceiptPort,
    private readonly executor: LocalExecutorPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly listSchedules: ListSchedulesUseCase,
    private readonly createSchedule: CreateScheduleUseCase,
    private readonly updateSchedule: UpdateScheduleUseCase,
    private readonly deleteSchedule: DeleteScheduleUseCase,
    private readonly listWebhooks: ListWebhooksUseCase,
    private readonly createWebhook: CreateWebhookUseCase,
    private readonly updateWebhook: UpdateWebhookUseCase,
    private readonly deleteWebhook: DeleteWebhookUseCase,
  ) {}

  async execute(input: ExecuteWorkerOrgOperationInput): Promise<WorkerOrgOperationResponse> {
    const token = input.bearerToken.trim();
    if (!token) {
      throw new UnauthorizedException('node token required');
    }
    const row = this.nodes.findByTokenHash(input.orgId, hashNodeToken(token));
    if (!row) {
      throw new UnauthorizedException('node unauthorized');
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: row.id, orgId: input.orgId };
    if (!authorize(principal, 'run.execute')) {
      throw new ForbiddenException('run.execute action is required for nodes');
    }
    const claim = this.claims.findByRun(input.orgId, input.body.runId);
    const now = new Date().toISOString();
    if (!claim || claim.nodeId !== row.id || claim.doneAt !== null || claim.leaseUntil <= now) {
      throw new HttpException(
        403,
        'ORG_OPERATION_FORBIDDEN',
        'Worker org operation requires active lease ownership',
        { runId: input.body.runId, operationId: input.body.operationId },
      );
    }
    const existing = this.receipts.find(input.orgId, input.body.runId, input.body.operationId);
    if (existing !== null) {
      return { operationId: input.body.operationId, result: existing };
    }
    const actorAgentId = await this.actorAgentId(input.orgId, input.body.runId);
    const result = await Promise.resolve(
      this.dispatch(input.orgId, actorAgentId, input.body.operation),
    );
    this.receipts.save(input.orgId, input.body.runId, input.body.operationId, result);
    return { operationId: input.body.operationId, result };
  }

  private async actorAgentId(orgId: string, runId: string): Promise<string> {
    const lifecycle = await this.executor.lifecycle(orgId);
    const run = await lifecycle.get(runId);
    if (!run) {
      throw new HttpException(404, 'RUN_NOT_FOUND', `run not found: ${runId}`);
    }
    const thread = this.threads.findById(orgId, run.threadId);
    if (!thread) {
      throw new HttpException(404, 'THREAD_NOT_FOUND', `thread not found: ${run.threadId}`);
    }
    return thread.agentId;
  }

  private dispatch(orgId: string, actorAgentId: string, operation: WorkerOrgOperation): unknown {
    if (operation.kind.startsWith('issue.')) {
      return this.dispatchIssue(orgId, actorAgentId, operation);
    }
    if (operation.kind.startsWith('schedule.')) {
      return this.dispatchSchedule(orgId, operation);
    }
    return this.dispatchWebhook(orgId, operation);
  }

  private dispatchIssue(
    orgId: string,
    actorAgentId: string,
    operation: WorkerOrgOperation,
  ): unknown {
    const issues = issueToolsDeps();
    if (!issues) {
      throw new HttpException(503, 'ISSUE_TOOLS_UNAVAILABLE', 'issue tools are not wired');
    }
    switch (operation.kind) {
      case 'issue.listBoards':
        return issues.listBoards.execute(orgId);
      case 'issue.listSources':
        return issues.listSources.execute({ orgId, surfaceHostId: null });
      case 'issue.list':
        return issues.listIssues.execute({
          orgId,
          ...(operation.boardId ? { boardId: operation.boardId } : {}),
        });
      case 'issue.get':
        return issues.getIssue.execute({ orgId, issueId: operation.issueId });
      case 'issue.create':
        return issues.createIssue.execute({ orgId, actorAgentId, body: operation.body });
      case 'issue.update':
        return issues.updateIssue.execute({
          orgId,
          issueId: operation.issueId,
          actorAgentId,
          body: operation.body,
        });
      case 'issue.status':
        return issues.updateStatus.execute({
          orgId,
          issueId: operation.issueId,
          actorAgentId,
          body: operation.body,
        });
      case 'issue.nudge':
        return issues.nudgeIssue.execute({ orgId, issueId: operation.issueId, actorAgentId });
      case 'issue.comment':
        return issues.addComment.execute({
          orgId,
          issueId: operation.issueId,
          authorType: 'agent',
          authorAgentId: actorAgentId,
          body: operation.body,
        });
      case 'issue.addDependency':
        return issues.addDependency.execute({
          orgId,
          issueId: operation.issueId,
          body: operation.body,
        });
      case 'issue.removeDependency':
        return issues.removeDependency.execute({
          orgId,
          issueId: operation.issueId,
          dependsOnIssueId: operation.dependsOnIssueId,
        });
      case 'issue.addSourceAttachment':
        return issues.addSourceAttachment.execute({
          orgId,
          issueId: operation.issueId,
          body: operation.body,
        });
      case 'issue.listLabels':
        return issues.listLabels.execute(orgId);
      case 'issue.createLabel':
        return issues.createLabel.execute({ orgId, body: operation.body });
      case 'issue.createBoard':
        return issues.createBoard.execute({ orgId, body: operation.body });
      case 'issue.updateBoard':
        return issues.updateBoard.execute({
          orgId,
          boardId: operation.boardId,
          body: operation.body,
        });
      case 'issue.deleteBoard':
        return issues.deleteBoard.execute({ orgId, boardId: operation.boardId });
      case 'issue.deleteLabel':
        return issues.deleteLabel.execute({ orgId, labelId: operation.labelId });
      case 'issue.saveBoardRule':
        return issues.saveBoardRule.execute({
          orgId,
          boardId: operation.boardId,
          ...(operation.ruleId !== undefined ? { ruleId: operation.ruleId } : {}),
          input: operation.body,
        });
      case 'issue.deleteBoardRule':
        return issues.removeBoardRule.execute({
          orgId,
          boardId: operation.boardId,
          ruleId: operation.ruleId,
        });
      default:
        throw new HttpException(400, 'ORG_OPERATION_UNKNOWN', 'unsupported operation');
    }
  }

  private dispatchSchedule(orgId: string, operation: WorkerOrgOperation): unknown {
    switch (operation.kind) {
      case 'schedule.list':
        return this.listSchedules.execute({ orgId });
      case 'schedule.create':
        return this.createSchedule.execute({ orgId, body: operation.body });
      case 'schedule.update':
        return this.updateSchedule.execute({
          orgId,
          scheduleId: operation.scheduleId,
          body: operation.body,
        });
      case 'schedule.remove':
        return this.deleteSchedule.execute({ orgId, scheduleId: operation.scheduleId });
      default:
        throw new HttpException(400, 'ORG_OPERATION_UNKNOWN', 'unsupported operation');
    }
  }

  private dispatchWebhook(orgId: string, operation: WorkerOrgOperation): unknown {
    switch (operation.kind) {
      case 'webhook.list':
        return this.listWebhooks.execute({ orgId });
      case 'webhook.create':
        return this.createWebhook.execute({ orgId, body: operation.body });
      case 'webhook.update':
        return this.updateWebhook.execute({
          orgId,
          webhookId: operation.webhookId,
          body: operation.body,
        });
      case 'webhook.remove':
        return this.deleteWebhook.execute({ orgId, webhookId: operation.webhookId });
      default:
        throw new HttpException(400, 'ORG_OPERATION_UNKNOWN', 'unsupported operation');
    }
  }
}
