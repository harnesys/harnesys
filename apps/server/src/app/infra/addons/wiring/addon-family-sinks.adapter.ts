import { Injectable } from '@harnesys/brix';
import type { InboundMessageSchema, TriggerFireOutcomeSchema } from '@harnesys/sdk';
import type { z } from 'zod';
import type { HostCallContext } from '../../../domain/addons/host-service.ts';
import type { BridgeInboundInput } from '../families/sinks-reference.ts';
import type { TransportInboundService } from '../families/transport/transport.family.ts';
import type { TriggerFireService } from '../families/trigger/trigger-fire.sink.ts';
import type { WorkerReportService } from '../families/worker/worker.family.ts';
import type { TriggerFireInput } from '../services/sinks.ts';
import { BridgeInboundSink, TriggerFireSink, WorkerReportSink } from '../services/sinks.ts';

type InboundMessage = z.infer<typeof InboundMessageSchema>;
type TriggerFireOutcome = z.infer<typeof TriggerFireOutcomeSchema>;

@Injectable()
export class TriggerFireSinkAdapter extends TriggerFireSink {
  constructor(private readonly fires: TriggerFireService) {
    super();
  }

  override async fire(ctx: HostCallContext, input: TriggerFireInput): Promise<TriggerFireOutcome> {
    return await this.fires.fire({
      orgId: ctx.orgId,
      addonId: ctx.addonId,
      instanceId: input.instanceId,
      runKey: input.runKey,
      text: input.text,
    });
  }
}

@Injectable()
export class BridgeInboundSinkAdapter extends BridgeInboundSink {
  constructor(private readonly inboundService: TransportInboundService) {
    super();
  }

  override async inbound(ctx: HostCallContext, message: InboundMessage): Promise<void> {
    const input: BridgeInboundInput = {
      orgId: ctx.orgId,
      addonId: ctx.addonId,
      message: { channel: message.channel, text: message.text },
    };
    await this.inboundService.inbound(input);
  }
}

@Injectable()
export class WorkerReportSinkAdapter extends WorkerReportSink {
  constructor(private readonly reportService: WorkerReportService) {
    super();
  }

  override async report(
    ctx: HostCallContext,
    input: { workerId: string; state: 'running' | 'stopped' | 'failed'; code?: string },
  ): Promise<void> {
    await this.reportService.report({
      orgId: ctx.orgId,
      addonId: ctx.addonId,
      workerId: input.workerId,
      state: input.state,
      ...(input.code === undefined ? {} : { code: input.code }),
    });
  }
}
