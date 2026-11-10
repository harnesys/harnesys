import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { FieldValue, JsonObject } from '@harnesys/sdk';
import { ConfigDescriptorSchema } from '@harnesys/sdk';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonAuditPort } from '../../../domain/addons/ports/audit.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { EventBusPort } from '../../../domain/events/event-bus.port.ts';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { appendAudit, jsonOf, requireOrgAddon, requirePackage } from './org-addon.helpers.ts';
import { addonSecretKeyPrefix } from './uninstall.use-case.ts';

export interface SetConfigRequest {
  orgId: string;
  addonId: string;
  values: Record<string, FieldValue>;
  secrets?: Record<string, string | null>;
  actor: { kind: 'user' | 'system' | 'host'; id: string };
}

@Injectable()
export class SetConfigUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly orgAddons: OrgAddonRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly events: EventBusPort,
    private readonly audit: AddonAuditPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addons-set-config');
  }

  async execute(request: SetConfigRequest): Promise<OrgAddonRow> {
    const row = requireOrgAddon(this.orgAddons, request.orgId, request.addonId);
    const pkg = requirePackage(this.catalog, request.addonId, row.version);
    const secretKeys = this.secretKeysOf(pkg.manifest);
    const config: JsonObject = jsonOf(row.configJson);
    const prefix = addonSecretKeyPrefix(request.orgId, request.addonId);
    for (const [key, value] of Object.entries(request.values)) {
      if (secretKeys.has(key)) {
        await this.secrets.set(request.orgId, `${prefix}${key}`, String(value));
        continue;
      }
      config[key] = value;
    }
    this.orgAddons.updateConfig(request.orgId, request.addonId, JSON.stringify(config));
    for (const [key, value] of Object.entries(request.secrets ?? {})) {
      if (value === null) {
        await this.secrets.delete(request.orgId, `${prefix}${key}`);
        continue;
      }
      await this.secrets.set(request.orgId, `${prefix}${key}`, value);
    }
    const touchedKeys = [...Object.keys(request.values), ...Object.keys(request.secrets ?? {})];
    this.events.publish(request.orgId, 'config.changed', {
      orgId: request.orgId,
      addonId: request.addonId,
      keys: touchedKeys,
    });
    appendAudit(this.audit, request.orgId, request.actor, {
      action: 'addon.set_config',
      target: `${request.addonId}@${row.version}`,
      outcome: 'ok',
      details: { keys: touchedKeys },
    });
    this.logger.info(
      { orgId: request.orgId, addonId: request.addonId, keys: touchedKeys.length },
      'config updated',
    );
    return { ...row, configJson: JSON.stringify(config), updatedAt: new Date().toISOString() };
  }

  private secretKeysOf(manifest: AddonManifestLike): Set<string> {
    const contribution = manifest.contributions.find((entry) => entry.family === 'config');
    if (!contribution) {
      return new Set();
    }
    const parsed = ConfigDescriptorSchema.safeParse(contribution.descriptor);
    if (!parsed.success) {
      return new Set();
    }
    return new Set(
      parsed.data.fields.filter((field) => field.type === 'secret').map((field) => field.key),
    );
  }
}

interface AddonManifestLike {
  contributions: Array<{ family: string; descriptor: JsonObject }>;
}
