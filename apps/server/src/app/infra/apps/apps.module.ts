import { Module } from '@harnesys/brix';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { AppKindRegistryAdapter } from './app-kind-registry.adapter.ts';
import { AppRegistryAdapter } from './app-registry.adapter.ts';
import { GithubAppKindProviderAdapter } from './providers/github/github-app-kind-provider.adapter.ts';
import { GoogleAppKindProviderAdapter } from './providers/google/google-app-kind-provider.adapter.ts';
import { TelegramAppKindProviderAdapter } from './providers/telegram/telegram-app-kind-provider.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [
    { provide: AppRegistryPort, useClass: AppRegistryAdapter },
    { provide: AppKindRegistryPort, useClass: AppKindRegistryAdapter },
    GoogleAppKindProviderAdapter,
    GithubAppKindProviderAdapter,
    TelegramAppKindProviderAdapter,
  ],
  exports: [AppRegistryPort, AppKindRegistryPort],
})
export class AppsModule {}
