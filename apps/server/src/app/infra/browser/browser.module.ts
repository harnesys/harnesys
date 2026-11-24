import { Module } from '@harnesys/brix';
import { BrowserHostPort } from '../../domain/browser/browser-host.port.ts';
import { BrowserSessionRegistryPort } from '../../domain/browser/browser-session-registry.port.ts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';
import { CredentialResolvePort } from '../../domain/browser/credential-resolve.port.ts';
import { EgressProxyPort } from '../../domain/browser/egress-proxy.port.ts';
import { BrowserLoginAttemptPort } from '../../domain/browser/login-attempt.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { BrowserLoginAttemptAdapter } from './browser-login-attempt.adapter.ts';
import { BrowserSessionRegistryAdapter } from './browser-session-registry.adapter.ts';
import { BrowserCredentialRepositoryAdapter } from './credential-repository.adapter.ts';
import { LocalCredentialResolveAdapter } from './credential-resolve.adapter.ts';
import { EgressProxyAdapter } from './egress-proxy.adapter.ts';
import { VaultPluginMaterializer } from './harnesys-vault-plugin.ts';
import { LocalBrowserHostAdapter } from './local-browser-host.adapter.ts';

@Module({
  global: true,
  imports: [MachineHomeModule, SecretModule, SkillsModule],
  providers: [
    { provide: BrowserHostPort, useClass: LocalBrowserHostAdapter },
    { provide: BrowserCredentialRepositoryPort, useClass: BrowserCredentialRepositoryAdapter },
    { provide: CredentialResolvePort, useClass: LocalCredentialResolveAdapter },
    { provide: BrowserLoginAttemptPort, useClass: BrowserLoginAttemptAdapter },
    { provide: EgressProxyPort, useClass: EgressProxyAdapter },
    { provide: BrowserSessionRegistryPort, useClass: BrowserSessionRegistryAdapter },
    VaultPluginMaterializer,
  ],
  exports: [
    BrowserHostPort,
    OrgSettingsPort,
    BrowserCredentialRepositoryPort,
    CredentialResolvePort,
    BrowserLoginAttemptPort,
    EgressProxyPort,
    BrowserSessionRegistryPort,
    VaultPluginMaterializer,
  ],
})
export class BrowserModule {}
