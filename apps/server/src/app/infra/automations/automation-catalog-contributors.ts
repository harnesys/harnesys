import type { AutomationCatalogContributorPort } from '../../domain/automations/automation-catalog-contributor.port.ts';

export class AutomationCatalogContributors {
  constructor(readonly contributors: readonly AutomationCatalogContributorPort[]) {}
}
