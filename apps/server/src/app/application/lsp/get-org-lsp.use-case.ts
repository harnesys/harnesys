import { Injectable } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { readOrgLspFile } from '../../domain/lsp/org-lsp-file.ts';
import { buildLspView } from './lsp-view.ts';

export interface GetOrgLspRequest {
  orgId: string;
}

@Injectable()
export class GetOrgLspUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly toolchain: ToolchainPort,
  ) {}

  async execute(request: GetOrgLspRequest): Promise<OrgLspListResponse> {
    this.layout.ensureOrgDir(request.orgId);
    const file = readOrgLspFile(this.layout.lspConfigPath(request.orgId));
    return buildLspView({
      orgId: request.orgId,
      file,
      runtime: this.runtime,
      plugins: this.plugins,
      includeRaw: true,
      hasBinary: (command) => this.toolchain.hasBinary(request.orgId, command),
    });
  }
}
