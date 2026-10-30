import { EntityNotFoundException, Injectable, ValidationException } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  fileHasServer,
  readOrgLspFile,
  withoutServer,
  writeOrgLspFile,
} from '../../infra/lsp/org-lsp-file.ts';

export interface DeleteOrgLspServerRequest {
  orgId: string;
  serverId: string;
}

@Injectable()
export class DeleteOrgLspServerUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  async execute(request: DeleteOrgLspServerRequest): Promise<void> {
    if (request.serverId.startsWith('plugin:')) {
      throw new ValidationException(`lsp server ${request.serverId} belongs to a plugin`);
    }
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    if (!fileHasServer(file, request.serverId)) {
      throw new EntityNotFoundException('lsp server not found', { serverId: request.serverId });
    }
    writeOrgLspFile(path, withoutServer(file.raw, request.serverId));
  }
}
