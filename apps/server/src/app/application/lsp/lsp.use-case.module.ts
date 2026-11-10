import { Module } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { DeleteOrgLspServerUseCase } from './delete-org-lsp-server.use-case.ts';
import { GetOrgLspUseCase } from './get-org-lsp.use-case.ts';
import { GetSourceLspUseCase } from './get-source-lsp.use-case.ts';
import { InstallOrgLspBinaryUseCase } from './install-org-lsp-binary.use-case.ts';
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
import { UpsertOrgLspServerUseCase } from './upsert-org-lsp-server.use-case.ts';

const useCases = [
  GetOrgLspUseCase,
  PutOrgLspUseCase,
  UpsertOrgLspServerUseCase,
  DeleteOrgLspServerUseCase,
  InstallOrgLspBinaryUseCase,
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
  providers: [...useCases],
  exports: [...useCases, LspPort],
})
export class LspUseCaseModule {}
