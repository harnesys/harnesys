import { Injectable, Logger } from '@harnesys/brix';
import type { FieldValue } from '@harnesys/sdk';
import { ConfigDescriptorSchema, defaultConfigValues, type FieldSpec } from '@harnesys/sdk';
import type { z } from 'zod';
import type { FamilyModule } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import { ownerKeyId } from '../../../../domain/addons/owner.ts';
import { AddonNotifyPort } from '../../../../domain/addons/ports/addon-notify.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';

type ConfigSchema = z.infer<typeof ConfigDescriptorSchema>;

export interface ConfigChangeSink {
  notify(orgId: string, addonId: string, keys: readonly string[]): Promise<void>;
}

@Injectable()
export class AddonConfigFieldStore {
  private readonly fields = new Map<string, readonly FieldSpec[]>();

  set(owner: OwnerKey, fields: readonly FieldSpec[]): void {
    this.fields.set(ownerKeyId(owner), fields);
  }

  removeOwner(owner: OwnerKey): void {
    this.fields.delete(ownerKeyId(owner));
  }

  fieldSpecs(orgId: string, addonId: string): readonly FieldSpec[] {
    for (const [key, value] of this.fields.entries()) {
      if (key.startsWith(`${orgId}/${addonId}@`)) {
        return value;
      }
    }
    return [];
  }
}

@Injectable()
export class ConfigNotifier implements ConfigChangeSink {
  constructor(
    private readonly notifyPort: AddonNotifyPort,
    private readonly logger: Logger,
  ) {}

  async notify(orgId: string, addonId: string, keys: readonly string[]): Promise<void> {
    const outcome = this.notifyPort.notify(orgId, addonId, 'config.changed', { keys: [...keys] });
    if (outcome === 'not_running') {
      this.logger.info(
        { orgId, addonId, keys },
        'addon config changed while stopped; addon reads config on next call',
      );
    }
  }
}

@Injectable()
export class AddonConfigReadModel {
  constructor(
    private readonly store: AddonConfigFieldStore,
    private readonly orgAddons: OrgAddonRepositoryPort,
  ) {}

  fieldSpecs(orgId: string, addonId: string): readonly FieldSpec[] {
    return this.store.fieldSpecs(orgId, addonId);
  }

  values(orgId: string, addonId: string): Record<string, FieldValue> {
    const row = this.orgAddons.find(orgId, addonId);
    let stored: Record<string, unknown> = {};
    if (row !== null) {
      try {
        const parsed: unknown = JSON.parse(row.configJson);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          stored = parsed as Record<string, unknown>;
        }
      } catch {
        stored = {};
      }
    }
    const defaults = defaultConfigValues([...this.store.fieldSpecs(orgId, addonId)]);
    return { ...defaults, ...stored } as Record<string, FieldValue>;
  }
}

@Injectable()
export class ConfigFamilyModule implements FamilyModule<ConfigSchema> {
  readonly family = 'config';
  readonly versions = [1] as const;
  readonly handlers = [];
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly store: AddonConfigFieldStore,
    readonly notifier: ConfigNotifier,
  ) {}

  schema(_v: number): z.ZodType<ConfigSchema> {
    return ConfigDescriptorSchema as z.ZodType<ConfigSchema>;
  }

  register(owner: OwnerKey, d: ConfigSchema): Disposable {
    this.store.set(owner, d.fields);
    return {
      dispose: () => {
        this.store.removeOwner(owner);
      },
    };
  }
}
