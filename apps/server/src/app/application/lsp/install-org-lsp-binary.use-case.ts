import {
  EntityNotFoundException,
  HttpException,
  Injectable,
  ValidationException,
} from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import type { LspCatalogSpec } from '../../domain/lsp/lsp-catalog.ts';
import { catalogSpecById, lspInstallSpecForCommand } from '../../domain/lsp/lsp-catalog.ts';
import type { LspPackageManager } from '../../domain/lsp/lsp-install.port.ts';
import { LspInstallPort } from '../../domain/lsp/lsp-install.port.ts';
import {
  disabledFileEntries,
  readOrgLspFile,
  withServerUpsert,
  writeOrgLspFile,
} from '../../domain/lsp/org-lsp-file.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
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
    private readonly lspInstall: LspInstallPort,
  ) {}

  async execute(request: InstallOrgLspBinaryRequest): Promise<OrgLspListResponse> {
    if (request.serverId.startsWith('plugin:')) {
      throw new ValidationException(`lsp server ${request.serverId} belongs to a plugin`);
    }
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    const catalog = catalogSpecById(request.serverId);
    const configured = this.configuredCommand(file, request.serverId);
    const command = configured ?? catalog?.command ?? '';
    if (command.length === 0) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    const spec = lspInstallSpecForCommand(command);
    if (spec === undefined) {
      throw new HttpException(
        501,
        'LSP_INSTALL_UNAVAILABLE',
        `no curated install command for "${command}"`,
        {},
      );
    }
    if (spec.plan.kind === 'shell') {
      this.assertShellPrerequisite(request.orgId, spec.plan.requires);
    }
    try {
      await this.lspInstall.installBinary(spec, {
        pathEnv: this.toolchain.resolve(request.orgId).pathEnv,
        packageManager: this.pickPackageManager(request.orgId),
      });
    } catch (error) {
      throw new ValidationException(
        `install failed for ${command}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (catalog !== undefined && configured === undefined) {
      this.seedCatalogServer(path, file.raw, catalog);
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

  private configuredCommand(
    file: ReturnType<typeof readOrgLspFile>,
    serverId: string,
  ): string | undefined {
    return (
      file.servers.find((server) => server.serverId === serverId)?.command ??
      disabledFileEntries(file.raw).find((server) => server.serverId === serverId)?.command
    );
  }

  private assertShellPrerequisite(orgId: string, requires: string): void {
    if (this.toolchain.hasBinary(orgId, requires)) {
      return;
    }
    throw new ValidationException(
      `"${requires}" is not installed on this host — install the ${requires} toolchain first, then retry`,
    );
  }

  private pickPackageManager(orgId: string): LspPackageManager {
    if (this.toolchain.hasBinary(orgId, 'npm')) {
      return 'npm';
    }
    if (this.toolchain.hasBinary(orgId, 'bun')) {
      return 'bun';
    }
    return 'npm';
  }

  private seedCatalogServer(path: string, raw: unknown, spec: LspCatalogSpec): void {
    try {
      writeOrgLspFile(
        path,
        withServerUpsert(raw, spec.serverId, {
          command: spec.command,
          ...(spec.args !== undefined ? { args: spec.args } : {}),
          extensionToLanguage: spec.extensionToLanguage,
        }),
      );
    } catch {
      undefined;
    }
  }
}
