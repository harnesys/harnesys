import type { AddonDatabase } from 'harnesys/integration';

export abstract class AddonDatabasePort {
  abstract open(orgId: string, integrationId: string): AddonDatabase;

  abstract close(orgId: string, integrationId: string): void;

  abstract remove(orgId: string, integrationId: string): void;
}
