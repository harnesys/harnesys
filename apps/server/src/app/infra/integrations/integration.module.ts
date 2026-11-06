import { Module } from '@harnesys/brix';
import { ThreadUseCaseModule } from '../../application/threads/thread.use-case.module.ts';
import { AutomationReadModelPort } from '../../domain/automations/automation-read-model.port.ts';
import { AddonDatabasePort } from '../../domain/integration/addon-database.port.ts';
import { IntegrationHostPort } from '../../domain/integration/integration-host.port.ts';
import { EventsWatchModule } from '../events-watch/events-watch.module.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { ScheduleModule } from '../schedules/schedule.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { ThreadModule } from '../thread/thread.module.ts';
import { WebhookModule } from '../webhooks/webhook.module.ts';
import { AddonDatabaseAdapter } from './addon-database.adapter.ts';
import { AutomationReadModelAdapter } from './automation-read-model.adapter.ts';
import { IntegrationHost } from './integration-host.ts';

@Module({
  imports: [
    MachineHomeModule,
    SecretModule,
    ScheduleModule,
    WebhookModule,
    ThreadModule,
    EventsWatchModule,
    ThreadUseCaseModule,
  ],
  providers: [
    { provide: AddonDatabasePort, useClass: AddonDatabaseAdapter },
    { provide: IntegrationHostPort, useClass: IntegrationHost },
    { provide: AutomationReadModelPort, useClass: AutomationReadModelAdapter },
  ],
  exports: [AddonDatabasePort, IntegrationHostPort, AutomationReadModelPort],
})
export class IntegrationModule {}
