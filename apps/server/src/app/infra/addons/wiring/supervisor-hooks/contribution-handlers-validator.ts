import { Injectable } from '@harnesys/brix';
import { AddonPackageCatalogPort } from '../../../../domain/addons/ports/addon-package-catalog.port.ts';
import { FamilyModuleList } from '../../families/family-module-list.ts';
import type { SupervisorHandlersValidator } from '../../supervisor/supervisor-deps.ts';

/**
 * Every non-optional contribution whose family is active (known family,
 * supported descriptor version) must have its family handlers implemented,
 * otherwise the addon is rejected during `initialize` (§4.2/§8.4).
 */
@Injectable()
export class ContributionHandlersValidator implements SupervisorHandlersValidator {
  constructor(
    private readonly catalog: AddonPackageCatalogPort,
    private readonly families: FamilyModuleList,
  ) {}

  validate(
    addonId: string,
    handlers: readonly string[],
  ): { ok: boolean; missing: readonly string[] } {
    const pkg = this.catalog.find(addonId);
    if (!pkg) {
      return { ok: true, missing: [] };
    }
    const provided = new Set(handlers);
    const missing = new Set<string>();
    for (const contribution of pkg.manifest.contributions) {
      if (contribution.optional) {
        continue;
      }
      const family = this.families.modules.find((entry) => entry.family === contribution.family);
      if (!family?.versions.includes(contribution.v ?? 1)) {
        continue;
      }
      for (const handler of family.handlers) {
        if (!provided.has(handler.method)) {
          missing.add(handler.method);
        }
      }
    }
    return { ok: missing.size === 0, missing: [...missing] };
  }
}
