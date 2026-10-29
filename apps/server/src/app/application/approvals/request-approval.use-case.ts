import { Injectable } from '@harnesys/brix';
import type {
  ApprovalPublic,
  ApprovalContext as ContractApprovalContext,
  CreateApprovalBody,
} from '@harnesys/contracts';
import { type ApprovalContext } from '../../domain/approval/approval.ts';
import { ApprovalEventsPort } from '../../domain/approval/approval-events.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { toApprovalPublic } from './approval.helpers.ts';

export interface RequestApprovalRequest {
  orgId: string;
  body: CreateApprovalBody;
}

@Injectable()
export class RequestApprovalUseCase {
  constructor(
    private readonly store: ApprovalStorePort,
    private readonly events: ApprovalEventsPort,
  ) {}

  execute(request: RequestApprovalRequest): ApprovalPublic {
    const context = contextFromBody(request.body.context);
    const { id } = this.store.request(request.orgId, {
      runId: request.body.runId,
      agentId: request.body.agentId,
      threadId: request.body.threadId ?? null,
      interruptId: request.body.interruptId,
      kind: request.body.kind,
      question: request.body.question,
      options: request.body.options,
      context,
    });
    const row = this.store.get(request.orgId, id);
    if (!row) {
      throw new Error(`approval insert missing: ${id}`);
    }
    this.events.emit(request.orgId, { type: 'requested', approval: row });
    return toApprovalPublic(row);
  }
}

function contextFromBody(raw: ContractApprovalContext | undefined): ApprovalContext {
  if (!raw) {
    return { source: 'manual' };
  }
  return {
    source: raw.source || 'manual',
    ...(raw.ops ? { ops: raw.ops } : {}),
    ...(raw.tool ? { tool: raw.tool } : {}),
    ...(raw.note ? { note: raw.note } : {}),
    ...(raw.override ? { override: raw.override } : {}),
  };
}
