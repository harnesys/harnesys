import { Injectable, Logger } from '@harnesys/brix';
import { TransportDescriptorSchema, type TransportMessage } from '@harnesys/sdk';
import type { z } from 'zod';
import { BridgeInboundPort } from '../../../../application/addons/bridge/bridge-inbound.port.ts';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import type { AddonCallOptions } from '../../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import type { ChannelCapabilities } from '../../../../domain/connector/channel-capabilities.ts';
import { l10nText } from '../shared.ts';
import type { BridgeInboundInput, BridgeInboundSink } from '../sinks-reference.ts';
import { TransportAskRegistry } from './transport-ask.registry.ts';

type TransportSchema = z.infer<typeof TransportDescriptorSchema>;

const HANDLERS: readonly HandlerSpec[] = [
  handlerSpec('transport.send'),
  handlerSpec('transport.edit'),
  handlerSpec('transport.typing'),
];
const TRANSPORT_CALL_TIMEOUT_MS = 30_000;
const INBOUND_QUEUE_LIMIT = 256;

export function channelCapabilitiesOf(descriptor: TransportSchema): ChannelCapabilities {
  return {
    canReadUnmentioned: true,
    supportsTopics: descriptor.capabilities.topics ?? false,
    supportsReplyTargets: true,
    canEditMessages: descriptor.capabilities.edit,
    maxMessageLength: descriptor.limits.textMax,
    streaming: false,
  };
}

export interface RegisteredTransport {
  owner: OwnerKey;
  descriptor: TransportSchema;
  provider: string;
  title: string;
  capabilities: ChannelCapabilities;
}

@Injectable()
export class AddonTransportRegistry {
  private readonly entries = new Map<string, RegisteredTransport>();

  register(owner: OwnerKey, d: TransportSchema): void {
    this.entries.set(ownerKeyId(owner), {
      owner,
      descriptor: d,
      provider: d.provider,
      title: l10nText(d.title),
      capabilities: channelCapabilitiesOf(d),
    });
  }

  removeOwner(owner: OwnerKey): void {
    this.entries.delete(ownerKeyId(owner));
  }

  find(orgId: string, addonId: string): RegisteredTransport | undefined {
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId === orgId && entry.owner.addonId === addonId) {
        return entry;
      }
    }
    return undefined;
  }

  byProvider(orgId: string, provider: string): RegisteredTransport | undefined {
    for (const entry of this.entries.values()) {
      if (entry.owner.orgId === orgId && entry.provider === provider) {
        return entry;
      }
    }
    return undefined;
  }

  list(orgId: string): RegisteredTransport[] {
    return [...this.entries.values()].filter((entry) => entry.owner.orgId === orgId);
  }
}

@Injectable()
export class TransportInboundService implements BridgeInboundSink {
  private readonly queues = new Map<string, BridgeInboundInput[]>();
  private readonly consuming = new Set<string>();

  constructor(
    private readonly registry: AddonTransportRegistry,
    private readonly bridge: BridgeInboundPort,
    private readonly asks: TransportAskRegistry,
    private readonly logger: Logger,
  ) {}

  async inbound(input: BridgeInboundInput): Promise<void> {
    const transport = this.registry.find(input.orgId, input.addonId);
    if (transport === undefined) {
      return;
    }
    this.enqueue(input);
    this.consume(input.orgId, input.addonId, transport.provider);
  }

  private consume(orgId: string, addonId: string, provider: string): void {
    const key = `${orgId}/${addonId}`;
    if (this.consuming.has(key)) {
      return;
    }
    this.consuming.add(key);
    void this.drainIntoBridge(orgId, addonId, provider).finally(() => {
      this.consuming.delete(key);
    });
  }

  private async drainIntoBridge(orgId: string, addonId: string, provider: string): Promise<void> {
    for (;;) {
      const pending = this.drain(orgId, addonId);
      if (pending.length === 0) {
        return;
      }
      for (const input of pending) {
        await this.deliver(orgId, addonId, provider, input);
      }
    }
  }

  private async deliver(
    orgId: string,
    addonId: string,
    provider: string,
    input: BridgeInboundInput,
  ): Promise<void> {
    try {
      const answered = await this.asks.tryAnswer({
        orgId: input.orgId,
        addonId: input.addonId,
        provider,
        channel: input.message.channel,
        text: input.message.text,
      });
      if (answered) {
        return;
      }
      await this.bridge.execute({
        orgId: input.orgId,
        addonId: input.addonId,
        transportProvider: provider,
        message: input.message,
        ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      });
    } catch (error) {
      this.logger.warn(
        { orgId, addonId, error: error instanceof Error ? error.message : String(error) },
        'bridge inbound failed',
      );
    }
  }

  enqueue(input: BridgeInboundInput): number {
    const key = `${input.orgId}/${input.addonId}`;
    const queue = this.queues.get(key) ?? [];
    queue.push(input);
    let dropped = 0;
    while (queue.length > INBOUND_QUEUE_LIMIT) {
      queue.shift();
      dropped += 1;
    }
    this.queues.set(key, queue);
    if (dropped > 0) {
      this.logger.warn({ dropped, addonId: input.addonId }, 'transport inbound queue overflow');
    }
    return dropped;
  }

  drain(orgId: string, addonId: string): BridgeInboundInput[] {
    const key = `${orgId}/${addonId}`;
    const queue = this.queues.get(key) ?? [];
    this.queues.delete(key);
    return queue;
  }
}

@Injectable()
export class TransportFamilyModule implements FamilyModule<TransportSchema> {
  readonly family = 'transport';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    readonly registry: AddonTransportRegistry,
    readonly inbound: TransportInboundService,
    private readonly calls: AddonCallPort,
  ) {}

  schema(_v: number): z.ZodType<TransportSchema> {
    return TransportDescriptorSchema as z.ZodType<TransportSchema>;
  }

  register(owner: OwnerKey, d: TransportSchema): Disposable {
    this.registry.register(owner, d);
    return {
      dispose: () => {
        this.registry.removeOwner(owner);
      },
    };
  }

  sendMessage(
    orgId: string,
    addonId: string,
    message: TransportMessage,
    opts?: AddonCallOptions,
  ): Promise<{ messageId?: string }> {
    return this.calls.transportSend(
      orgId,
      addonId,
      message,
      opts ?? { timeoutMs: TRANSPORT_CALL_TIMEOUT_MS },
    );
  }

  editMessage(
    orgId: string,
    addonId: string,
    messageId: string,
    message: TransportMessage,
    opts?: AddonCallOptions,
  ): Promise<void> {
    return this.calls.transportEdit(
      orgId,
      addonId,
      { messageId, message },
      opts ?? { timeoutMs: TRANSPORT_CALL_TIMEOUT_MS },
    );
  }

  setTyping(
    orgId: string,
    addonId: string,
    channel: string,
    on: boolean,
    opts?: AddonCallOptions,
  ): Promise<void> {
    return this.calls.transportTyping(
      orgId,
      addonId,
      { channel, on },
      opts ?? { timeoutMs: TRANSPORT_CALL_TIMEOUT_MS },
    );
  }
}
