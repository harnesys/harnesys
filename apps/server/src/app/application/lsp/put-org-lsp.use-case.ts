import { Injectable, ValidationException } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { readOrgLspFile, writeOrgLspFile } from '../../infra/lsp/org-lsp-file.ts';
import { toLspListResponse } from './lsp-status.ts';

export interface PutOrgLspRequest {
  orgId: string;
  body: unknown;
}

@Injectable()
export class PutOrgLspUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  execute(request: PutOrgLspRequest): OrgLspListResponse {
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    try {
      writeOrgLspFile(path, request.body);
    } catch (error) {
      throw new ValidationException(
        error instanceof Error ? error.message : 'invalid org LSP config',
      );
    }
    return toLspListResponse(readOrgLspFile(path), true);
  }
}
