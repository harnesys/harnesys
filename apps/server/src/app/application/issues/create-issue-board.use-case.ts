import { Injectable } from '@harnesys/brix';
import type { CreateIssueBoardBody, CreateIssueBoardResponse } from '@harnesys/contracts';
import { BOARD_TEMPLATES } from '@harnesys/contracts';
import type { IssueBoardInsert } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface CreateIssueBoardRequest {
  orgId: string;
  body: CreateIssueBoardBody;
}

@Injectable()
export class CreateIssueBoardUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: CreateIssueBoardRequest): CreateIssueBoardResponse {
    const now = new Date().toISOString();
    const template = request.body.template ? BOARD_TEMPLATES[request.body.template] : undefined;
    const statuses = request.body.statuses
      ? request.body.statuses.map((status) => ({ ...status }))
      : (template?.statuses ?? []).map((status) => ({ ...status }));
    const record: IssueBoardInsert = {
      id: crypto.randomUUID(),
      orgId: request.orgId,
      name: request.body.name,
      description: request.body.description ?? template?.description ?? '',
      color: request.body.color ?? template?.color ?? '#6366f1',
      icon: request.body.icon ?? template?.icon ?? 'square-kanban',
      status: 'active',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      statuses,
    };
    const board = this.boards.insert(record);
    this.events.emit(request.orgId, { type: 'board', board });
    return { board: toBoardPublic(board) };
  }
}
