import { Injectable } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { GetToolchainDiscoveryUseCase } from './get-toolchain-discovery.use-case.ts';

export interface RefreshToolchainRequest {
  orgId: string;
}

@Injectable()
export class RefreshToolchainUseCase {
  constructor(
    private readonly toolchain: ToolchainPort,
    private readonly lsp: LspPort,
    private readonly discover: GetToolchainDiscoveryUseCase,
  ) {}

  async execute(request: RefreshToolchainRequest) {
    this.toolchain.invalidate(request.orgId);
    this.lsp.invalidateOrg(request.orgId);
    return await this.discover.execute(request);
  }
}
