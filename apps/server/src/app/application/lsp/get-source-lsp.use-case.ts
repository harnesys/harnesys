import { Injectable } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { PluginRuntimePort } from '../../domain/plugin/plugin-runtime.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { readLspJsonText } from '../../domain/lsp/org-lsp-file.ts';
import { buildLspView } from './lsp-view.ts';

export interface GetSourceLspRequest {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class GetSourceLspUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly runtime: PluginRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly toolchain: ToolchainPort,
  ) {}

  async execute(request: GetSourceLspRequest): Promise<OrgLspListResponse> {
    const source = this.sources.findById(request.orgId, request.sourceId);
    if (!source) {
      throw new SourceNotFoundException(request.sourceId);
    }
    const file = readLspJsonText(source.lspJson ?? '', `sources/${request.sourceId}/lsp_json`);
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
