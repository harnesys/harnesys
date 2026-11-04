import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { TelegramApiPort } from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { OrgTelegramDeps } from '../../infra/runtime/packs/org-telegram.port.ts';
import { setTelegramToolsDeps } from '../../infra/runtime/packs/telegram-tools.holder.ts';

@Injectable()
export class TelegramToolsProvider implements ModuleInitHook {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
    private readonly telegram: TelegramApiPort,
  ) {}

  onModuleInit(): void {
    const deps: OrgTelegramDeps = {
      connectors: this.connectors,
      secrets: this.secrets,
      telegram: this.telegram,
    };
    setTelegramToolsDeps(deps);
  }
}
