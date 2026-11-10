import { Module } from '@harnesys/brix';
import { AutomationCatalogPort } from '../../domain/automations/automation-catalog.port.ts';
import type { AutomationCatalogContributorPort } from '../../domain/automations/automation-catalog-contributor.port.ts';
import { IntegrationModule } from '../integrations/integration.module.ts';
import { AutomationCatalogContributors } from './automation-catalog-contributors.ts';
import { CompositeAutomationCatalogAdapter } from './composite-automation-catalog.adapter.ts';
import { IntegrationAutomationCatalogAdapter } from './integration-automation-catalog.adapter.ts';

@Module({
  global: true,
  imports: [IntegrationModule],
  providers: [
    IntegrationAutomationCatalogAdapter,
    {
      provide: AutomationCatalogContributors,
      useFactory: (...contributors: AutomationCatalogContributorPort[]) =>
        new AutomationCatalogContributors(contributors),
      inject: [IntegrationAutomationCatalogAdapter],
    },
    { provide: AutomationCatalogPort, useClass: CompositeAutomationCatalogAdapter },
  ],
  exports: [AutomationCatalogPort],
})
export class AutomationsModule {}
