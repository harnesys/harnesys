import { Injectable, ValidationException } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { parseLspServers, readLspJsonText } from '../../domain/lsp/org-lsp-file.ts';
import { toLspListResponse } from './lsp-status.ts';

export interface PutSourceLspRequest {
  orgId: string;
  sourceId: string;
  body: unknown;
}

@Injectable()
export class PutSourceLspUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly toolchain: ToolchainPort,
  ) {}

  execute(request: PutSourceLspRequest): OrgLspListResponse {
    const source = this.sources.findById(request.orgId, request.sourceId);
    if (!source) {
      throw new SourceNotFoundException(request.sourceId);
    }
    const record =
      typeof request.body === 'object' &&
      request.body !== null &&
      !Array.isArray(request.body) &&
      'servers' in request.body
        ? (request.body as { servers: unknown }).servers
        : request.body;
    const parsed = parseLspServers(record, `sources/${request.sourceId}/lsp_json`);
    if (parsed.diagnostics.length > 0) {
      throw new ValidationException(
        parsed.diagnostics.map((d) => d.message).join('; ') || 'invalid source LSP config',
      );
    }
    const text = `${JSON.stringify(request.body, null, 2)}\n`;
    this.sources.updateLspJson(request.orgId, request.sourceId, text);
    return toLspListResponse(
      readLspJsonText(text, `sources/${request.sourceId}/lsp_json`),
      true,
      (command) => this.toolchain.hasBinary(request.orgId, command),
    );
  }
}
