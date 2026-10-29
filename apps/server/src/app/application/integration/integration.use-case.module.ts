import { Module } from '@harnesys/brix';
import { IntegrationModule } from '../../infra/integration/integration.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { SourceUseCaseModule } from '../source/source.use-case.module.ts';
import { DisconnectIntegrationUseCase } from './disconnect-integration.use-case.ts';
import { FinalizeGoogleIntegrationUseCase } from './finalize-google-integration.use-case.ts';
import { FinishGoogleOAuthLoopbackUseCase } from './finish-google-oauth-loopback.use-case.ts';
import { GetGoogleAppStatusUseCase } from './get-google-app-status.use-case.ts';
import { GetGooglePickerSessionUseCase } from './get-google-picker-session.use-case.ts';
import { GitCredentialUseCase } from './git-credential.use-case.ts';
import { GithubAppStatusUseCase } from './github-app-status.use-case.ts';
import { GithubInstallCallbackUseCase } from './github-install-callback.use-case.ts';
import { GithubManifestCallbackUseCase } from './github-manifest-callback.use-case.ts';
import { GithubManifestConnectUseCase } from './github-manifest-connect.use-case.ts';
import { GithubToolsProvider } from './github-tools.provider.ts';
import { GithubWebhookUseCase } from './github-webhook.use-case.ts';
import { GoogleToolsProvider } from './google-tools.provider.ts';
import { ListGithubReposUseCase } from './list-github-repos.use-case.ts';
import { ListIntegrationsUseCase } from './list-integrations.use-case.ts';
import { PollGithubInstallUseCase } from './poll-github-install.use-case.ts';
import { PollGoogleOAuthUseCase } from './poll-google-oauth.use-case.ts';
import { SaveGoogleAppConfigUseCase } from './save-google-app-config.use-case.ts';
import { StartGithubInstallUseCase } from './start-github-install.use-case.ts';
import { StartGithubManifestUseCase } from './start-github-manifest.use-case.ts';
import { StartGoogleOAuthLoopbackUseCase } from './start-google-oauth-loopback.use-case.ts';

@Module({
  imports: [SourceModule, IntegrationModule, SecretModule, MachineHomeModule, SourceUseCaseModule],
  providers: [
    ListIntegrationsUseCase,
    DisconnectIntegrationUseCase,
    StartGoogleOAuthLoopbackUseCase,
    FinishGoogleOAuthLoopbackUseCase,
    PollGoogleOAuthUseCase,
    FinalizeGoogleIntegrationUseCase,
    GetGooglePickerSessionUseCase,
    GetGoogleAppStatusUseCase,
    SaveGoogleAppConfigUseCase,
    GoogleToolsProvider,
    GithubAppStatusUseCase,
    StartGithubInstallUseCase,
    StartGithubManifestUseCase,
    GithubManifestCallbackUseCase,
    GithubManifestConnectUseCase,
    PollGithubInstallUseCase,
    GithubInstallCallbackUseCase,
    ListGithubReposUseCase,
    GithubWebhookUseCase,
    GithubToolsProvider,
    GitCredentialUseCase,
  ],
  exports: [
    ListIntegrationsUseCase,
    DisconnectIntegrationUseCase,
    StartGoogleOAuthLoopbackUseCase,
    FinishGoogleOAuthLoopbackUseCase,
    PollGoogleOAuthUseCase,
    GetGooglePickerSessionUseCase,
    GetGoogleAppStatusUseCase,
    SaveGoogleAppConfigUseCase,
    GithubAppStatusUseCase,
    StartGithubInstallUseCase,
    StartGithubManifestUseCase,
    GithubManifestCallbackUseCase,
    GithubManifestConnectUseCase,
    PollGithubInstallUseCase,
    GithubInstallCallbackUseCase,
    ListGithubReposUseCase,
    GithubWebhookUseCase,
    GitCredentialUseCase,
  ],
})
export class IntegrationUseCaseModule {}
