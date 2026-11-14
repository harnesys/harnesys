import { Module } from '@harnesys/brix';
import { AutomationCatalogPort } from '../../domain/automations/automation-catalog.port.ts';
import type { AutomationCatalogContributorPort } from '../../domain/automations/automation-catalog-contributor.port.ts';
import { AddonTriggerCatalogContributor } from '../addons/families/trigger/trigger.family.ts';
import { AutomationCatalogContributors } from './automation-catalog-contributors.ts';
import { CompositeAutomationCatalogAdapter } from './composite-automation-catalog.adapter.ts';

@Module({
  global: true,
  providers: [
    {
      provide: AutomationCatalogContributors,
      useFactory: (...contributors: AutomationCatalogContributorPort[]) =>
        new AutomationCatalogContributors(contributors),
      inject: [AddonTriggerCatalogContributor],
    },
    { provide: AutomationCatalogPort, useClass: CompositeAutomationCatalogAdapter },
  ],
  exports: [AutomationCatalogPort],
})
export class AutomationsModule {}
