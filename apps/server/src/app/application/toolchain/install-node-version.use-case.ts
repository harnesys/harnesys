import { Injectable } from '@harnesys/brix';
import type { ToolchainNodeVersion } from '@harnesys/contracts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';

export interface InstallNodeVersionRequest {
  orgId: string;
  version: string;
}

@Injectable()
export class InstallNodeVersionUseCase {
  constructor(private readonly toolchain: ToolchainPort) {}

  execute(request: InstallNodeVersionRequest): Promise<ToolchainNodeVersion> {
    return this.toolchain.installNodeVersion(request.orgId, request.version.trim());
  }
}
