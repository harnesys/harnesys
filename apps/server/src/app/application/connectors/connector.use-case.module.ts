import { Module } from '@harnesys/brix';
import { ConnectorOutboundPort } from '../../domain/connector/connector-outbound.port.ts';
import { TelegramPollerSyncPort } from '../../domain/connector/telegram-poller-sync.port.ts';
import { AgentModule } from '../../infra/agent/agent.module.ts';
import { ConnectorModule } from '../../infra/connector/connector.module.ts';
import { TelegramPoller } from '../../infra/connector/telegram-poller.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { RuntimeModule } from '../../infra/runtime/runtime.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { ThreadModule } from '../../infra/thread/thread.module.ts';
import { UsageModule } from '../../infra/usage/usage.module.ts';
import { SkillsUseCaseModule } from '../skills/skills.use-case.module.ts';
import { ThreadUseCaseModule } from '../threads/thread.use-case.module.ts';
import { ApplyTelegramUpdateUseCase } from './apply-telegram-update.use-case.ts';
import { ListConnectorsUseCase } from './list-connectors.use-case.ts';
import { ProjectConnectorEventsUseCase } from './project-connector-events.use-case.ts';
import { RunTelegramCommandUseCase } from './run-telegram-command.use-case.ts';
import {
  IssuePairCodeUseCase,
  PatchTelegramPolicyUseCase,
  PauseTelegramConnectorUseCase,
  RemoveTelegramConnectorUseCase,
  ResumeTelegramConnectorUseCase,
  UnpairTelegramConnectorUseCase,
} from './telegram-connector-actions.use-case.ts';
import { UpsertTelegramConnectorUseCase } from './upsert-telegram-connector.use-case.ts';

const useCases = [
  UpsertTelegramConnectorUseCase,
  ListConnectorsUseCase,
  IssuePairCodeUseCase,
  PauseTelegramConnectorUseCase,
  ResumeTelegramConnectorUseCase,
  UnpairTelegramConnectorUseCase,
  RemoveTelegramConnectorUseCase,
  PatchTelegramPolicyUseCase,
  ApplyTelegramUpdateUseCase,
  RunTelegramCommandUseCase,
];

@Module({
  imports: [
    ConnectorModule,
    SecretModule,
    MachineHomeModule,
    ThreadModule,
    AgentModule,
    RuntimeModule,
    ThreadUseCaseModule,
    SkillsUseCaseModule,
    UsageModule,
  ],
  providers: [
    ...useCases,
    { provide: TelegramPollerSyncPort, useClass: TelegramPoller },
    { provide: ConnectorOutboundPort, useClass: ProjectConnectorEventsUseCase },
  ],
  exports: [...useCases, ConnectorOutboundPort, TelegramPollerSyncPort],
})
export class ConnectorUseCaseModule {}
