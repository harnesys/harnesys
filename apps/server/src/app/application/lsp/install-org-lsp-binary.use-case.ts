import {
  EntityNotFoundException,
  HttpException,
  Injectable,
  ValidationException,
} from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { installLspBinary, installSpecForCommand } from '../../infra/lsp/install-lsp-binary.ts';
import {
  disabledFileEntries,
  fileHasServer,
  readOrgLspFile,
} from '../../infra/lsp/org-lsp-file.ts';
import { buildLspView } from './lsp-view.ts';

export interface InstallOrgLspBinaryRequest {
  orgId: string;
  serverId: string;
}

@Injectable()
export class InstallOrgLspBinaryUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly toolchain: ToolchainPort,
  ) {}

  async execute(request: InstallOrgLspBinaryRequest): Promise<OrgLspListResponse> {
    if (request.serverId.startsWith('plugin:')) {
      throw new ValidationException(`lsp server ${request.serverId} belongs to a plugin`);
    }
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    if (!fileHasServer(file, request.serverId)) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    const command =
      file.servers.find((server) => server.serverId === request.serverId)?.command ??
      disabledFileEntries(file.raw).find((server) => server.serverId === request.serverId)
        ?.command ??
      '';
    const spec = installSpecForCommand(command);
    if (spec === undefined) {
      throw new HttpException(
        501,
        'LSP_INSTALL_UNAVAILABLE',
        `no curated install command for "${command}"`,
        {},
      );
    }
    try {
      await installLspBinary(spec, this.toolchain.resolve(request.orgId).pathEnv);
    } catch (error) {
      throw new ValidationException(
        `install failed for ${command}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return buildLspView({
      orgId: request.orgId,
      file: readOrgLspFile(path),
      runtime: this.runtime,
      plugins: this.plugins,
      includeRaw: true,
      hasBinary: (command) => this.toolchain.hasBinary(request.orgId, command),
    });
  }
}
