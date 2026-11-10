import { Module } from '@harnesys/brix';
import { MtprotoLoginPort } from '../../domain/apps/mtproto-port.ts';
import { AccountEventPort } from '../../domain/apps/ports/account-event.port.ts';
import { AccountHolderPort } from '../../domain/apps/ports/account-holder.port.ts';
import { AccountRepositoryPort } from '../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../domain/apps/ports/clock.port.ts';
import { ConnectSessionStorePort } from '../../domain/apps/ports/connect-session-store.port.ts';
import { ProviderHttpFactoryPort } from '../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../domain/apps/ports/secret-scope.port.ts';
import { MetricsPort } from '../../domain/metrics/metrics.port.ts';
import { ProviderHttpAdapter } from '../http/provider-http.adapter.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { AccountRepositoryAdapter } from './account-repository.adapter.ts';
import { AppRepositoryAdapter } from './app-repository.adapter.ts';
import { ConnectReaper } from './connect-reaper.ts';
import { ConnectSessionStoreAdapter } from './connect-session-store.adapter.ts';
import { TeleprotoMtprotoAdapter } from './mtproto.adapter.ts';
import { AppsOrphanSweeper } from './orphan-sweeper.ts';
import { ProviderRegistryAdapter } from './provider-registry.adapter.ts';
import {
  AccountHolderRegistry,
  InProcessAccountEvents,
  LoggerMetricsAdapter,
  PublicUrlsAdapter,
  SystemClockAdapter,
} from './runtime.adapters.ts';
import { ScopedSecretsAdapter } from './scoped-secrets.adapter.ts';

@Module({
  imports: [MachineHomeModule, SecretModule],
  providers: [
    { provide: ProviderRegistryPort, useClass: ProviderRegistryAdapter },
    { provide: AppRepositoryPort, useClass: AppRepositoryAdapter },
    { provide: AccountRepositoryPort, useClass: AccountRepositoryAdapter },
    { provide: SecretScopePort, useClass: ScopedSecretsAdapter },
    { provide: ConnectSessionStorePort, useClass: ConnectSessionStoreAdapter },
    { provide: PublicUrlsPort, useClass: PublicUrlsAdapter },
    { provide: ClockPort, useClass: SystemClockAdapter },
    { provide: MetricsPort, useClass: LoggerMetricsAdapter },
    { provide: AccountEventPort, useClass: InProcessAccountEvents },
    { provide: AccountHolderPort, useClass: AccountHolderRegistry },
    { provide: ProviderHttpFactoryPort, useClass: ProviderHttpAdapter },
    { provide: MtprotoLoginPort, useClass: TeleprotoMtprotoAdapter },
    ConnectReaper,
    AppsOrphanSweeper,
  ],
  exports: [
    ProviderRegistryPort,
    AppRepositoryPort,
    AccountRepositoryPort,
    SecretScopePort,
    ConnectSessionStorePort,
    PublicUrlsPort,
    ClockPort,
    MetricsPort,
    AccountEventPort,
    AccountHolderPort,
    ProviderHttpFactoryPort,
    MtprotoLoginPort,
  ],
})
export class AppsModule {}
