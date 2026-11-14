import { join } from 'node:path';
import type { Logger } from '@harnesys/brix';
import { AddonNotifyPort } from '../../../domain/addons/ports/addon-notify.port.ts';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type { AddonMigrationsPort } from '../addon-migrations.port.ts';

export interface AddonMigrationDeps {
  migrations: AddonMigrationsPort;
  notify: AddonNotifyPort;
  logger: Logger;
}

export interface AddonMigrationInput {
  orgId: string;
  pkg: InstalledAddonPackage;
  fromVersion: string | null;
}

/**
 * §9.3 activation steps: run the package SQL migrations against the org
 * data.db (the runner restores its backup and throws migration_failed on
 * failure), then notify a version change via lifecycle.upgrade {fromVersion}
 * for code-level migrations. `fromVersion` is null on first enable.
 */
export function runAddonDataMigrations(deps: AddonMigrationDeps, input: AddonMigrationInput): void {
  if (input.pkg.manifest.data !== undefined) {
    const result = deps.migrations.run({
      orgId: input.orgId,
      addonId: input.pkg.id,
      migrationsDir: join(input.pkg.root, input.pkg.manifest.data.migrations),
    });
    if (result.applied.length > 0) {
      deps.logger.info(
        { orgId: input.orgId, addonId: input.pkg.id, applied: result.applied },
        'addon data migrations applied',
      );
    }
  }
  if (input.fromVersion !== null && input.fromVersion !== input.pkg.version) {
    const outcome = deps.notify.notify(input.orgId, input.pkg.id, 'lifecycle.upgrade', {
      fromVersion: input.fromVersion,
    });
    deps.logger.info(
      { orgId: input.orgId, addonId: input.pkg.id, fromVersion: input.fromVersion, outcome },
      'addon lifecycle.upgrade notified',
    );
  }
}
