import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { appendAudit, requireOrgAddon } from './org-addon.helpers.ts';

export interface DisableAddonRequest {
  orgId: string;
  addonId: string;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class DisableAddonUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-disable');
  }

  async execute(request: DisableAddonRequest): Promise<void> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    if (!row.enabled) {
      return;
    }
    await this.stopTriggerInstances(request.orgId, request.addonId);
    await this.supervisor.stop(request.orgId, request.addonId, 'disabled');
    this.registry.deactivate({
      orgId: request.orgId,
      addonId: request.addonId,
      version: row.version,
    });
    this.orgAddons.setEnabled(request.orgId, request.addonId, false);
    this.orgAddons.updateHealth(request.orgId, request.addonId, 'stopped');
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.disable',
      target: `${request.addonId}@${row.version}`,
      outcome: 'ok',
    });
    this.logger.info({ orgId: request.orgId, addonId: request.addonId }, 'addon disabled');
  }

  private async stopTriggerInstances(orgId: string, addonId: string): Promise<void> {
    for (const instance of this.triggers.list(orgId, addonId)) {
      if (!instance.enabled) {
        continue;
      }
      try {
        await this.calls.triggerStop(orgId, addonId, { instanceId: instance.id });
      } catch (error) {
        this.logger.warn(
          { orgId, addonId, instanceId: instance.id, error: String(error) },
          'trigger stop failed on disable',
        );
      }
    }
  }
}
