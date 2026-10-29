import { Module } from '@harnesys/brix';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { ConnectorRepositoryAdapter } from './connector-repository.adapter.ts';
import { TelegramApiAdapter } from './telegram-api.adapter.ts';

@Module({
  imports: [MachineHomeModule, SecretModule],
  providers: [
    { provide: ConnectorRepositoryPort, useClass: ConnectorRepositoryAdapter },
    { provide: TelegramApiPort, useClass: TelegramApiAdapter },
  ],
  exports: [ConnectorRepositoryPort, TelegramApiPort],
})
export class ConnectorModule {}
