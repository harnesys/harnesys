import { Injectable } from '@harnesys/brix';
import type { ListOrgMcpConfigResponse } from '@harnesys/contracts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { GetOrgMcpConfigUseCase } from './get-org-mcp-config.use-case.ts';

export interface ReloadOrgMcpRequest {
  orgId: string;
}

@Injectable()
export class ReloadOrgMcpUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly getConfig: GetOrgMcpConfigUseCase,
  ) {}

  async execute(request: ReloadOrgMcpRequest): Promise<ListOrgMcpConfigResponse> {
    await this.executor.invalidateRuntime(request.orgId);
    return this.getConfig.execute({ orgId: request.orgId });
  }
}
