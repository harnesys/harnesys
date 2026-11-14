import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { AgentRegistryPort } from '../../../../domain/agent/agent-registry.port.ts';
import { ThreadAgentRepositoryPort } from '../../../../domain/thread/thread-agent-repository.port.ts';
import { responderModeOf } from '../../../../domain/thread/thread-policy.ts';
import { ThreadRepositoryPort } from '../../../../domain/thread/thread-repository.port.ts';
import { serviceMethod } from '../method.ts';

/**
 * Read access to threads and the unified responder-policy handle. Addons edit
 * the same policy the thread settings page edits — one source of truth.
 */
@Injectable()
export class ThreadsHostService implements HostServiceModule {
  readonly namespace = 'threads';
  readonly methods: readonly HostMethodSpec[];

  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {
    this.methods = [
      serviceMethod('threads.get', undefined, (ctx, params) => this.get(ctx, params)),
      serviceMethod('threads.patch', undefined, (ctx, params) => this.patch(ctx, params)),
    ];
  }

  private async get(
    ctx: HostCallContext,
    params: { threadId: string },
  ): Promise<{
    thread?: {
      threadId: string;
      kind: string;
      title: string;
      responderMode: 'auto' | 'mention';
      autoReplyAgentId: string | null;
      agents: Array<{ id: string; name: string }>;
    };
  }> {
    const thread = this.threads.findById(ctx.orgId, params.threadId);
    if (thread === undefined) {
      return {};
    }
    const agents = this.threadAgents.listByThread(ctx.orgId, thread.id).map((row) => ({
      id: row.agentId,
      name: this.agents.findById(ctx.orgId, row.agentId)?.name ?? row.agentId,
    }));
    return {
      thread: {
        threadId: thread.id,
        kind: thread.kind,
        title: thread.title,
        responderMode: responderModeOf(thread.policy, thread.kind),
        autoReplyAgentId: thread.autoReplyAgentId,
        agents,
      },
    };
  }

  private async patch(
    ctx: HostCallContext,
    params: { threadId: string; responderMode?: 'auto' | 'mention' },
  ): Promise<Record<string, never>> {
    const thread = this.threads.findById(ctx.orgId, params.threadId);
    if (thread === undefined || params.responderMode === undefined) {
      return {};
    }
    this.threads.patch(ctx.orgId, thread.id, {
      policy: { ...thread.policy, version: 2, responderMode: params.responderMode },
    });
    return {};
  }
}
