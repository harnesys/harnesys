import { Injectable, ValidationException } from '@harnesys/brix';
import type { OrgLspListResponse, UpsertOrgLspServerBody } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import {
  parseExtensionMap,
  readOrgLspFile,
  withServerUpsert,
  writeOrgLspFile,
} from '../../infra/lsp/org-lsp-file.ts';
import { buildLspView } from './lsp-view.ts';

export interface UpsertOrgLspServerRequest {
  orgId: string;
  serverId: string;
  body: UpsertOrgLspServerBody;
}

@Injectable()
export class UpsertOrgLspServerUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
  ) {}

  async execute(request: UpsertOrgLspServerRequest): Promise<OrgLspListResponse> {
    if (request.serverId.startsWith('plugin:')) {
      throw new ValidationException(`lsp server ${request.serverId} belongs to a plugin`);
    }
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    const spec = {
      command: request.body.command.trim(),
      ...(request.body.args !== undefined ? { args: request.body.args } : {}),
      extensionToLanguage: parseExtensionMap(request.body.extensionToLanguage ?? {}),
    };
    try {
      writeOrgLspFile(path, withServerUpsert(file.raw, request.serverId, spec));
    } catch (error) {
      throw new ValidationException(
        error instanceof Error ? error.message : 'invalid org LSP config',
      );
    }
    return buildLspView(request.orgId, readOrgLspFile(path), this.runtime, this.plugins, true);
  }
}
