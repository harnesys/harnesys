import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import { BindingRepositoryPort } from '../../../domain/addons/ports/binding-repository.port.ts';
import { ContributionRegistryPort } from '../../../domain/addons/ports/contribution-registry.port.ts';
import { InstanceSupervisorPort } from '../../../domain/addons/ports/instance-supervisor.port.ts';
import { JobStateRepositoryPort } from '../../../domain/addons/ports/job-state-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { AddonDataPort } from '../addon-data.port.ts';
import { appendAudit, requireOrgAddon } from './org-addon.helpers.ts';

export interface UninstallAddonRequest {
  orgId: string;
  addonId: string;
  purgeData: boolean;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

export function addonSecretKeyPrefix(orgId: string, addonId: string): string {
  return `addon:${orgId}:${addonId}:`;
}

@Injectable()
export class UninstallAddonUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly registry: ContributionRegistryPort,
    private readonly supervisor: InstanceSupervisorPort,
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly jobs: JobStateRepositoryPort,
    private readonly bindings: BindingRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly secrets: SecretStorePort,
    private readonly data: AddonDataPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-uninstall');
  }

  async execute(request: UninstallAddonRequest): Promise<void> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    await this.stopInstances(request.orgId, request.addonId);
    this.registry.deactivate({
      orgId: request.orgId,
      addonId: request.addonId,
      version: row.version,
    });
    this.triggers.removeAddon(request.orgId, request.addonId);
    this.jobs.removeAddon(request.orgId, request.addonId);
    this.bindings.removeAddon(request.orgId, request.addonId);
    if (request.purgeData) {
      await this.purge(request);
    } else {
      this.orgAddons.setEnabled(request.orgId, request.addonId, false);
      this.orgAddons.updateHealth(request.orgId, request.addonId, 'stopped');
    }
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.uninstall',
      target: `${request.addonId}@${row.version}`,
      outcome: 'ok',
      details: { purgeData: request.purgeData },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, purgeData: request.purgeData },
      'addon uninstalled',
    );
  }

  private async stopInstances(orgId: string, addonId: string): Promise<void> {
    for (const instance of this.triggers.list(orgId, addonId)) {
      if (!instance.enabled) {
        continue;
      }
      try {
        await this.calls.triggerStop(orgId, addonId, { instanceId: instance.id });
      } catch (error) {
        this.logger.warn(
          { orgId, addonId, instanceId: instance.id, error: String(error) },
          'trigger stop failed on uninstall',
        );
      }
    }
    await this.supervisor.stop(orgId, addonId, 'uninstalled');
  }

  private async purge(request: UninstallAddonRequest): Promise<void> {
    const prefix = addonSecretKeyPrefix(request.orgId, request.addonId);
    const keys = await this.secrets.listKeys(request.orgId);
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        await this.secrets.delete(request.orgId, key);
      }
    }
    this.data.removeData(request.orgId, request.addonId);
    this.orgAddons.remove(request.orgId, request.addonId);
  }
}
