export interface AddonMigrationsRequest {
  orgId: string;
  addonId: string;
  migrationsDir: string;
}

export interface AddonMigrationsResult {
  applied: number[];
}

/**
 * §9.3: runs the SQL migrations of an addon package against the org's
 * data.db, with backup, per-file transactions and schema_newer protection.
 * Failure restores the backup inside the runner and throws migration_failed.
 */
export abstract class AddonMigrationsPort {
  abstract run(request: AddonMigrationsRequest): AddonMigrationsResult;
}
