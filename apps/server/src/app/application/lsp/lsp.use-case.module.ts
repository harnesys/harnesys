import { Module } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { LspModule } from '../../infra/lsp/lsp.module.ts';
import { MachineHomeModule } from '../../infra/machine-home/machine-home.module.ts';
import { PluginsModule } from '../../infra/plugins/plugins.module.ts';
import { SourceModule } from '../../infra/source/source.module.ts';
import { ApplyOrgLspPresetUseCase } from './apply-org-lsp-preset.use-case.ts';
import { GetOrgLspUseCase } from './get-org-lsp.use-case.ts';
import { GetSourceLspUseCase } from './get-source-lsp.use-case.ts';
import { LspQueryUseCase } from './lsp-query.use-case.ts';
import {
  LspDefinitionUseCase,
  LspDiagnosticsUseCase,
  LspHoverUseCase,
  LspReferencesUseCase,
} from './lsp-query.use-cases.ts';
import { PutOrgLspUseCase } from './put-org-lsp.use-case.ts';
import { PutSourceLspUseCase } from './put-source-lsp.use-case.ts';
import { RestartOrgLspServerUseCase } from './restart-org-lsp-server.use-case.ts';
import { SetOrgLspServerStateUseCase } from './set-org-lsp-server-state.use-case.ts';

const useCases = [
  GetOrgLspUseCase,
  PutOrgLspUseCase,
  ApplyOrgLspPresetUseCase,
  RestartOrgLspServerUseCase,
  SetOrgLspServerStateUseCase,
  GetSourceLspUseCase,
  PutSourceLspUseCase,
  LspQueryUseCase,
  LspDiagnosticsUseCase,
  LspHoverUseCase,
  LspDefinitionUseCase,
  LspReferencesUseCase,
];

@Module({
  imports: [MachineHomeModule, SourceModule, LspModule, PluginsModule],
  providers: [...useCases],
  exports: [...useCases, LspPort],
})
export class LspUseCaseModule {}
