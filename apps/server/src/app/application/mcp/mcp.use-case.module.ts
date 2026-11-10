import { Module } from '@harnesys/brix';
import { DeleteOrgMcpServerUseCase } from './delete-org-mcp-server.use-case.ts';
import { GetOrgMcpUseCase } from './get-org-mcp.use-case.ts';
import { GetOrgMcpConfigUseCase } from './get-org-mcp-config.use-case.ts';
import { ReloadOrgMcpUseCase } from './reload-org-mcp.use-case.ts';
import { RestartOrgMcpServerUseCase } from './restart-org-mcp-server.use-case.ts';
import { SetOrgMcpServerStateUseCase } from './set-org-mcp-server-state.use-case.ts';
import { UpsertOrgMcpServerUseCase } from './upsert-org-mcp-server.use-case.ts';

const useCases = [
  GetOrgMcpUseCase,
  GetOrgMcpConfigUseCase,
  UpsertOrgMcpServerUseCase,
  DeleteOrgMcpServerUseCase,
  SetOrgMcpServerStateUseCase,
  ReloadOrgMcpUseCase,
  RestartOrgMcpServerUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class McpUseCaseModule {}
