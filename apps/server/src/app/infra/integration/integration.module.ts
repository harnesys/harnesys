import { Module } from '@harnesys/brix';
import { IntegrationEventsPort } from '../../domain/integration/integration-events.port.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SecretModule } from '../secret/secret.module.ts';
import { GithubAppStore } from './github/github-app-store.ts';
import { GithubInstallSessionStore } from './github/github-install-sessions.ts';
import { GithubManifestSessionStore } from './github/github-manifest-sessions.ts';
import { GithubTokenAdapter } from './github/github-token.adapter.ts';
import { GoogleOAuthSessionStore } from './google/google-oauth-sessions.ts';
import { GoogleTokenAdapter } from './google-token.adapter.ts';
import { IntegrationEventsAdapter } from './integration-events.adapter.ts';
import { IntegrationRegistryAdapter } from './integration-registry.adapter.ts';
import { IntegrationTokenDispatchAdapter } from './integration-token-dispatch.adapter.ts';

@Module({
  imports: [MachineHomeModule, SecretModule],
  providers: [
    { provide: IntegrationRegistryPort, useClass: IntegrationRegistryAdapter },
    { provide: IntegrationEventsPort, useClass: IntegrationEventsAdapter },
    GoogleTokenAdapter,
    GithubTokenAdapter,
    { provide: IntegrationTokenPort, useClass: IntegrationTokenDispatchAdapter },
    GoogleOAuthSessionStore,
    GithubInstallSessionStore,
    GithubManifestSessionStore,
    GithubAppStore,
  ],
  exports: [
    IntegrationRegistryPort,
    IntegrationEventsPort,
    IntegrationTokenPort,
    GoogleOAuthSessionStore,
    GithubInstallSessionStore,
    GithubManifestSessionStore,
    GithubAppStore,
  ],
})
export class IntegrationModule {}
