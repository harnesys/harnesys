import { EntityNotFoundException, Injectable } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { readOrgLspFile } from '../../domain/lsp/org-lsp-file.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { buildLspView } from './lsp-view.ts';

export interface RestartOrgLspServerRequest {
  orgId: string;
  serverId: string;
}

@Injectable()
export class RestartOrgLspServerUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly lsp: LspPort,
    private readonly toolchain: ToolchainPort,
  ) {}

  async execute(request: RestartOrgLspServerRequest): Promise<OrgLspListResponse> {
    this.layout.ensureOrgDir(request.orgId);
    const file = readOrgLspFile(this.layout.lspConfigPath(request.orgId));
    const bundle = await this.runtime.bundle(request.orgId);
    const isFileServer = file.servers.some((server) => server.serverId === request.serverId);
    const pluginEntry = bundle.lspServers.find((entry) => entry.spec.serverId === request.serverId);
    if (!isFileServer && pluginEntry === undefined) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    if (pluginEntry !== undefined) {
      this.lsp.invalidateOrg(request.orgId);
    }
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
