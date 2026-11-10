import { Injectable, Logger } from '@harnesys/brix';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerFamilyModule } from '../../families/trigger/trigger.family.ts';
import { WorkerFamilyModule } from '../../families/worker/worker.family.ts';
import type { SupervisorReplayHook } from '../../supervisor/supervisor-deps.ts';

function parseJsonObject(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed rows fall back to empty descriptors.
  }
  return {};
}

/**
 * §8.7: after `initialized`, re-deliver `trigger.start` for enabled trigger
 * instances and `worker.start` for autostart workers. Host-side job schedules
 * (croner) live in the host process and are unaffected by instance restarts,
 * so no job replay is needed.
 */
@Injectable()
export class InstanceReplayHook implements SupervisorReplayHook {
  private readonly log: Logger;

  constructor(
    logger: Logger,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly triggerFamily: TriggerFamilyModule,
    private readonly workerFamily: WorkerFamilyModule,
  ) {
    this.log = logger.child('addon-replay');
  }

  async replay(orgId: string, addonId: string): Promise<void> {
    const row = this.orgAddons.find(orgId, addonId);
    if (!row?.enabled) {
      return;
    }
    for (const instance of this.triggers.list(orgId, addonId)) {
      if (!instance.enabled) {
        continue;
      }
      const config = parseJsonObject(instance.configJson);
      const target = parseJsonObject(instance.targetJson);
      try {
        await this.triggerFamily.startInstance({
          orgId,
          addonId,
          instanceId: instance.id,
          kind: instance.triggerId,
          config,
          target,
        });
      } catch (error) {
        this.log.warn(
          { orgId, addonId, instanceId: instance.id, error: String(error) },
          'trigger replay failed',
        );
      }
    }
    try {
      await this.workerFamily.startAutostartWorkers(orgId, addonId);
    } catch (error) {
      this.log.warn({ orgId, addonId, error: String(error) }, 'worker autostart replay failed');
    }
  }
}
