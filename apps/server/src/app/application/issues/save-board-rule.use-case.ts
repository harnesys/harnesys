import { Injectable } from '@harnesys/brix';
import type {
  AssignAgentAction,
  BoardRuleInput,
  GetIssueBoardResponse,
  RuleAction,
  RuleCondition,
  RuleTrigger,
} from '@harnesys/contracts';
import { BoardRuleInputSchema } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { RuleValidationException } from '../../domain/issue/board.error.ts';
import type { BoardRuleWrite, IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { reloadBoardAndEmit } from './board-events.ts';
import { loadEditableBoard } from './board-guards.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface SaveBoardRuleRequest {
  orgId: string;
  boardId: string;
  ruleId?: string;
  actorUserId?: string | null;
  input: BoardRuleInput;
}

@Injectable()
export class SaveBoardRuleUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly labels: IssueLabelRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly profiles: ExecutionProfilePort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: SaveBoardRuleRequest): GetIssueBoardResponse {
    const { orgId } = request;
    const input: BoardRuleInput = BoardRuleInputSchema.parse(request.input);
    const board = loadEditableBoard(this.boards, orgId, request.boardId);
    this.validateReferences(orgId, board, input);
    const write: BoardRuleWrite = {
      ...(request.ruleId !== undefined ? { id: request.ruleId } : {}),
      createdByUserId: request.actorUserId ?? null,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      position: input.position,
      enabled: input.enabled,
    };
    this.boards.saveRule(orgId, board.id, write);
    const updated = reloadBoardAndEmit(this.boards, this.events, orgId, board.id);
    return { board: toBoardPublic(updated) };
  }

  private validateReferences(orgId: string, board: IssueBoardRecord, input: BoardRuleInput): void {
    const statusKeys = new Set(board.statuses.map((status) => status.key));
    this.validateTrigger(statusKeys, input.trigger);
    this.validateConditions(orgId, input.conditions);
    this.validateActions(orgId, statusKeys, input.actions);
  }

  private validateTrigger(statusKeys: Set<string>, trigger: RuleTrigger): void {
    if (trigger.type === 'status_entered' && !statusKeys.has(trigger.statusKey)) {
      throw new RuleValidationException(`unknown rule status: ${trigger.statusKey}`);
    }
  }

  private validateConditions(orgId: string, conditions: RuleCondition[]): void {
    for (const condition of conditions) {
      if (!this.labels.findById(orgId, condition.labelId)) {
        throw new RuleValidationException(`unknown rule label: ${condition.labelId}`);
      }
    }
  }

  private validateActions(orgId: string, statusKeys: Set<string>, actions: RuleAction[]): void {
    for (const action of actions) {
      this.validateAction(orgId, statusKeys, action);
    }
  }

  private validateAction(orgId: string, statusKeys: Set<string>, action: RuleAction): void {
    if (action.type === 'assign_agent') {
      this.validateAgentAction(orgId, action);
      return;
    }
    if (action.type === 'set_status' && !statusKeys.has(action.statusKey)) {
      throw new RuleValidationException(`unknown rule status: ${action.statusKey}`);
    }
  }

  private validateAgentAction(orgId: string, action: AssignAgentAction): void {
    if (!this.agents.findById(orgId, action.agentId)) {
      throw new RuleValidationException(`unknown rule agent: ${action.agentId}`);
    }
    const profileId = action.executionProfileId;
    if (profileId === undefined || profileId === LOCAL_EXECUTION_PROFILE_ID) {
      return;
    }
    if (!this.profiles.findById(orgId, profileId)) {
      throw new RuleValidationException(`unknown execution profile: ${profileId}`);
    }
  }
}
