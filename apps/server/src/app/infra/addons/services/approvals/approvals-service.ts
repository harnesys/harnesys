import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import type { ApprovalContext } from '../../../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../../../domain/approval/approval-store.port.ts';
import { serviceMethod } from '../method.ts';

interface ApprovalRequestParams {
  interruptId: string;
  agentId: string;
  threadId?: string;
  kind: 'tool' | 'spend' | 'memory' | 'question' | 'file_access';
  question: string;
  options: Array<'approve' | 'approve_once' | 'deny' | 'block_path' | 'close'>;
  context: {
    source: string;
    ops?: string[];
    tool?: {
      name: string;
      inputPreview?: string;
      command?: string;
      truncated?: boolean;
    };
    note?: string;
  };
}

@Injectable()
export class ApprovalsHostService implements HostServiceModule {
  readonly namespace = 'approvals';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly store: ApprovalStorePort) {
    this.methods = [
      serviceMethod('approvals.request', undefined, (ctx, params) =>
        this.request(ctx, params as ApprovalRequestParams),
      ),
    ];
  }

  private async request(
    ctx: HostCallContext,
    params: ApprovalRequestParams,
  ): Promise<{ id: string }> {
    const context: ApprovalContext = {
      source: params.context.source,
      ...(params.context.ops === undefined ? {} : { ops: params.context.ops }),
      ...(params.context.tool === undefined ? {} : { tool: params.context.tool }),
      ...(params.context.note === undefined ? {} : { note: params.context.note }),
    };
    const record = this.store.request(ctx.orgId, {
      runId: crypto.randomUUID(),
      agentId: params.agentId,
      threadId: params.threadId ?? null,
      interruptId: params.interruptId,
      kind: params.kind,
      question: params.question,
      options: params.options,
      context,
    });
    return { id: record.id };
  }
}
