import { Injectable } from '@harnesys/brix';
import { AddonMigrationsPort } from '../../../application/addons/addon-migrations.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { orgAddonDbPath } from '../catalog/addon-paths.ts';
import { runAddonMigrations } from '../storage/addon-migrations.ts';

@Injectable()
export class AddonMigrationsAdapter extends AddonMigrationsPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  override run(request: { orgId: string; addonId: string; migrationsDir: string }): {
    applied: number[];
  } {
    return runAddonMigrations({
      dbPath: orgAddonDbPath(this.layout.orgDataDir(request.orgId), request.addonId),
      migrationsDir: request.migrationsDir,
    });
  }
}
