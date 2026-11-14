import type { Logger } from '@harnesys/brix';
import { AddonMigrationsPort } from '../../../application/addons/addon-migrations.port.ts';
import { ensureAddonDataMigrations } from '../../../application/addons/orgs/addon-migrations.ts';
import type { LaunchTarget } from './launch-target.ts';

/**
 * Every instance start applies pending package SQL migrations for the pinned
 * version, even when org_addons already records that version as enabled:
 * activation only runs migrations on version changes, so an add-on package
 * whose migrations directory changed under the same version would otherwise
 * run forever against a stale schema. The runner is a no-op when user_version
 * already matches the last migration.
 */
export function ensureInstanceSchema(
  migrations: AddonMigrationsPort,
  logger: Logger,
  target: LaunchTarget,
): void {
  if (target.migrationsDir === null) {
    return;
  }
  ensureAddonDataMigrations(
    { migrations, logger },
    {
      orgId: target.orgId,
      addonId: target.addonId,
      migrationsDir: target.migrationsDir,
    },
  );
}
