import { Module } from '@harnesys/brix';
import { BrowserModule } from '../../../infra/browser/browser.module.ts';
import { AddBrowserAllowlistUseCase } from './add-browser-allowlist.use-case.ts';
import { CheckAgentBrowserUpdateUseCase } from './check-agent-browser-update.use-case.ts';
import { GetOrgBrowserUseCase } from './get-org-browser.use-case.ts';
import { InstallAgentBrowserToolUseCase } from './install-agent-browser-tool.use-case.ts';
import { InstallBrowserEngineUseCase } from './install-browser-engine.use-case.ts';
import { ListBrowserEngineVersionsUseCase } from './list-browser-engine-versions.use-case.ts';
import { PutBrowserSettingsUseCase } from './put-browser-settings.use-case.ts';
import { RemoveBrowserEngineUseCase } from './remove-browser-engine.use-case.ts';
import { SetBrowserEngineStateUseCase } from './set-browser-engine-state.use-case.ts';

@Module({
  imports: [BrowserModule],
  providers: [
    GetOrgBrowserUseCase,
    InstallBrowserEngineUseCase,
    InstallAgentBrowserToolUseCase,
    CheckAgentBrowserUpdateUseCase,
    ListBrowserEngineVersionsUseCase,
    PutBrowserSettingsUseCase,
    AddBrowserAllowlistUseCase,
    SetBrowserEngineStateUseCase,
    RemoveBrowserEngineUseCase,
  ],
  exports: [
    GetOrgBrowserUseCase,
    InstallBrowserEngineUseCase,
    InstallAgentBrowserToolUseCase,
    CheckAgentBrowserUpdateUseCase,
    ListBrowserEngineVersionsUseCase,
    PutBrowserSettingsUseCase,
    AddBrowserAllowlistUseCase,
    SetBrowserEngineStateUseCase,
    RemoveBrowserEngineUseCase,
  ],
})
export class BrowserUseCaseModule {}
