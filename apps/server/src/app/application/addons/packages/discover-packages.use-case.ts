import { Injectable } from '@harnesys/brix';
import type { AddonDiscoverView } from '@harnesys/contracts';
import { AddonPackageCatalogPort } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import { AddonSourcePort } from '../../../domain/addons/ports/addon-source.port.ts';

@Injectable()
export class DiscoverPackagesUseCase {
  constructor(
    private readonly source: AddonSourcePort,
    private readonly catalog: AddonPackageCatalogPort,
  ) {}

  execute(): { items: AddonDiscoverView[] } {
    const installed = new Set(this.catalog.listInstalled().map((pkg) => pkg.id));
    return {
      items: this.source.listBuiltins().map((builtin) => ({
        ...builtin,
        installed: installed.has(builtin.id),
      })),
    };
  }
}
