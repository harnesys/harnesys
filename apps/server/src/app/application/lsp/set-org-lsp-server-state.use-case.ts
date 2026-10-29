import { EntityNotFoundException, Injectable } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { readOrgLspFile, withFileDisabled, writeOrgLspFile } from '../../infra/lsp/org-lsp-file.ts';
import { buildLspView } from './lsp-view.ts';

export interface SetOrgLspServerStateRequest {
  orgId: string;
  serverId: string;
  disabled: boolean;
}

@Injectable()
export class SetOrgLspServerStateUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly lsp: LspPort,
  ) {}

  async execute(request: SetOrgLspServerStateRequest): Promise<OrgLspListResponse> {
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    const view = await buildLspView(request.orgId, file, this.runtime, this.plugins, true);
    const entry = view.servers.find((server) => server.serverId === request.serverId);
    if (entry === undefined) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    if (!entry.origin.startsWith('plugin:')) {
      writeOrgLspFile(
        path,
        withFileDisabled(
          view.raw,
          request.serverId,
          {
            command: entry.command,
            ...(entry.args !== undefined ? { args: entry.args } : {}),
            extensionToLanguage: entry.extensionToLanguage,
          },
          request.disabled,
        ),
      );
      return buildLspView(request.orgId, readOrgLspFile(path), this.runtime, this.plugins, true);
    }
    const bundle = await this.runtime.bundle(request.orgId);
    const pluginEntry = bundle.lspServers.find(
      (candidate) => candidate.spec.serverId === request.serverId,
    );
    if (pluginEntry === undefined) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    this.plugins.setServerDisabled(
      request.orgId,
      pluginEntry.plugin,
      request.serverId,
      request.disabled,
    );
    this.lsp.invalidateOrg(request.orgId);
    return buildLspView(request.orgId, readOrgLspFile(path), this.runtime, this.plugins, true);
  }
}
