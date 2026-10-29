import type { ApprovalPublic } from '@harnesys/contracts';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';

export function toApprovalPublic(row: ApprovalRecord): ApprovalPublic {
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    threadId: row.threadId,
    interruptId: row.interruptId,
    kind: row.kind,
    question: row.question,
    options: row.options,
    context: {
      source: row.context.source,
      ...(row.context.ops ? { ops: row.context.ops } : {}),
      ...(row.context.tool ? { tool: row.context.tool } : {}),
      ...(row.context.note ? { note: row.context.note } : {}),
      ...(row.context.override ? { override: row.context.override } : {}),
    },
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionSeq: row.decisionSeq,
    createdAt: row.createdAt,
  };
}
