import { Injectable, Logger } from '@harnesys/brix';
import { FireTriggerUseCase } from '../../../../application/addons/triggers/fire-trigger.use-case.ts';
import type { TriggerFireInput, TriggerFireOutcome, TriggerFireSink } from '../sinks-reference.ts';

/**
 * Addon-facing trigger fire sink. Delegates to FireTriggerUseCase so the
 * addon path goes through the same dedup, perDay/throttleSec/maxBurst limits
 * and target handling as the host-side path.
 */
@Injectable()
export class TriggerFireService implements TriggerFireSink {
  constructor(
    private readonly fires: FireTriggerUseCase,
    private readonly logger: Logger,
  ) {}

  async fire(input: TriggerFireInput): Promise<TriggerFireOutcome> {
    try {
      const result = await this.fires.execute({
        orgId: input.orgId,
        addonId: input.addonId,
        instanceId: input.instanceId,
        runKey: input.runKey,
        text: input.text ?? '',
        ...(input.payload === undefined ? {} : { payload: input.payload }),
      });
      return {
        outcome: result.outcome,
        ...(result.runId === undefined ? {} : { runId: result.runId }),
      };
    } catch (error) {
      this.logger.error({ err: error, instanceId: input.instanceId }, 'trigger fire failed');
      return { outcome: 'failed' };
    }
  }
}
