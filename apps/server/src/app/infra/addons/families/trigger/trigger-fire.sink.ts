import { Injectable, Logger } from '@harnesys/brix';
import { RunDispatchPort } from '../../../../application/addons/run-dispatch.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import type { RunDispatchOutcome } from '../../../../domain/addons/run-dispatch.ts';
import type { TriggerFireInput, TriggerFireOutcome, TriggerFireSink } from '../sinks-reference.ts';

const FIRE_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TriggerFireService implements TriggerFireSink {
  constructor(
    private readonly instances: TriggerInstanceRepositoryPort,
    private readonly runs: RunDispatchPort,
    private readonly logger: Logger,
  ) {}

  async fire(input: TriggerFireInput): Promise<TriggerFireOutcome> {
    const row = this.instances.find(input.orgId, input.instanceId);
    if (row === null || row.addonId !== input.addonId || !row.enabled) {
      return 'failed';
    }
    const accepted = this.instances.recordFire(input.instanceId, input.runKey, Date.now());
    if (!accepted) {
      return 'suppressed';
    }
    const target = parseTarget(row.targetJson);
    if (typeof target.agentId !== 'string' || typeof target.threadId !== 'string') {
      return 'failed';
    }
    try {
      const outcome: RunDispatchOutcome = await this.runs.dispatch({
        orgId: input.orgId,
        threadId: target.threadId,
        agentId: target.agentId,
        text: input.text ?? '',
        runKey: input.runKey,
      });
      return outcome === 'fired' ? 'fired' : 'busy';
    } catch (error) {
      this.logger.error({ err: error, instanceId: input.instanceId }, 'trigger fire failed');
      return 'failed';
    }
  }
}

export { FIRE_DEDUP_WINDOW_MS };

function parseTarget(targetJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(targetJson);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
