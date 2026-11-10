import { Inject, Injectable, Logger } from '@harnesys/brix';
import {
  type AddonCallOptions,
  AddonCallPort,
} from '../../../domain/addons/ports/addon-call.port.ts';
import type { AddonTransportBindingRow } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { connectorOrigin, shouldEchoUser } from '../../../domain/connector/echo.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import { CreateThreadUseCase } from '../../threads/create-thread.use-case.ts';
import { type RunDispatchOutcome, RunDispatchPort } from '../run-dispatch.port.ts';
import {
  type BridgeInboundOutcome,
  BridgeInboundPort,
  type BridgeInboundRequest,
} from './bridge-inbound.port.ts';

const TRANSPORT_CALL_TIMEOUT_MS = 30_000;
const OUTBOUND_ECHO_MEMORY_LIMIT = 256;
const NO_AGENT_NOTICE =
  'No agent is available in this workspace yet, so the message cannot be delivered.';

@Injectable()
export class NeutralBridgeInboundUseCase extends BridgeInboundPort {
  private readonly logger: Logger;
  private readonly outboundMessageIds = new Map<string, Set<string>>();

  constructor(
    private readonly bindings: AddonTransportBindingRepositoryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly createThread: CreateThreadUseCase,
    private readonly dispatch: RunDispatchPort,
    private readonly calls: AddonCallPort,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('addons-bridge-inbound');
  }

  override async execute(request: BridgeInboundRequest): Promise<BridgeInboundOutcome> {
    if (this.isSelfEcho(request)) {
      return 'echo_suppressed';
    }
    const channel = request.message.channel;
    const binding = this.bindings.find(
      request.orgId,
      request.addonId,
      request.transportProvider,
      channel,
    );
    if (binding !== null && this.threads.findById(request.orgId, binding.threadId)) {
      return await this.dispatchToThread(request, binding);
    }
    if (binding !== null) {
      this.bindings.remove(request.orgId, request.addonId, request.transportProvider, channel);
    }
    return await this.bindAndDispatch(request);
  }

  override recordOutbound(orgId: string, addonId: string, messageId: string | undefined): void {
    if (messageId === undefined) {
      return;
    }
    const key = `${orgId}/${addonId}`;
    let ids = this.outboundMessageIds.get(key);
    if (ids === undefined) {
      ids = new Set<string>();
      this.outboundMessageIds.set(key, ids);
    }
    ids.add(messageId);
    while (ids.size > OUTBOUND_ECHO_MEMORY_LIMIT) {
      const oldest = ids.values().next().value;
      if (oldest === undefined) {
        break;
      }
      ids.delete(oldest);
    }
  }

  private isSelfEcho(request: BridgeInboundRequest): boolean {
    const replyTo = request.message.replyTo;
    if (replyTo === undefined) {
      return false;
    }
    const sent = this.outboundMessageIds.get(`${request.orgId}/${request.addonId}`);
    const isSelf = sent?.has(replyTo) === true;
    // Domain echo contract: self-originated messages are never mirrored into the thread.
    const origin = isSelf ? connectorOrigin(request.addonId) : 'external';
    return !shouldEchoUser(origin, request.addonId);
  }

  private async dispatchToThread(
    request: BridgeInboundRequest,
    binding: AddonTransportBindingRow,
  ): Promise<BridgeInboundOutcome> {
    const thread = this.threads.findById(request.orgId, binding.threadId);
    if (thread === undefined) {
      return 'skipped';
    }
    const { outcome } = await this.dispatch.dispatch({
      orgId: request.orgId,
      threadId: binding.threadId,
      agentId: thread.autoReplyAgentId ?? '',
      text: request.message.text,
      correlationId: request.correlationId,
    });
    this.logDispatch(request, binding.threadId, outcome);
    return 'dispatched';
  }

  private async bindAndDispatch(request: BridgeInboundRequest): Promise<BridgeInboundOutcome> {
    const agent = this.agents
      .list(request.orgId)
      .filter((entry) => entry.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (agent === undefined) {
      await this.autoReply(request, NO_AGENT_NOTICE);
      return 'auto_replied';
    }
    const thread = await this.createThread.execute({
      orgId: request.orgId,
      body: {
        agentId: agent.id,
        kind: 'chat',
        title: `${request.transportProvider} · ${request.message.channel}`,
      },
    });
    this.bindings.add({
      orgId: request.orgId,
      addonId: request.addonId,
      provider: request.transportProvider,
      externalChatId: request.message.channel,
      threadId: thread.id,
      createdAt: new Date().toISOString(),
    });
    const { outcome } = await this.dispatch.dispatch({
      orgId: request.orgId,
      threadId: thread.id,
      agentId: agent.id,
      text: request.message.text,
      correlationId: request.correlationId,
    });
    this.logDispatch(request, thread.id, outcome);
    return 'dispatched';
  }

  private async autoReply(request: BridgeInboundRequest, text: string): Promise<void> {
    const opts: AddonCallOptions = { timeoutMs: TRANSPORT_CALL_TIMEOUT_MS };
    const sent = await this.calls.transportSend(
      request.orgId,
      request.addonId,
      { channel: request.message.channel, text },
      opts,
    );
    this.recordOutbound(request.orgId, request.addonId, sent.messageId);
  }

  private logDispatch(
    request: BridgeInboundRequest,
    threadId: string,
    outcome: RunDispatchOutcome,
  ): void {
    this.logger.info(
      {
        orgId: request.orgId,
        addonId: request.addonId,
        provider: request.transportProvider,
        channel: request.message.channel,
        threadId,
        outcome,
      },
      'bridge inbound dispatched',
    );
  }
}
