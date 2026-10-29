import { HttpException, Injectable } from '@harnesys/brix';
import type { OrgLspListResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { PRESET_INSTALL_HINT, TYPESCRIPT_PRESET } from '../../infra/lsp/lsp-presets.ts';
import { readOrgLspFile, withPreset, writeOrgLspFile } from '../../infra/lsp/org-lsp-file.ts';
import { toLspListResponse } from './lsp-status.ts';

export interface ApplyOrgLspPresetRequest {
  orgId: string;
  lang: string;
}

@Injectable()
export class ApplyOrgLspPresetUseCase {
  constructor(private readonly layout: HostFsLayoutPort) {}

  execute(request: ApplyOrgLspPresetRequest): OrgLspListResponse {
    if (request.lang !== 'typescript') {
      const hint =
        PRESET_INSTALL_HINT[request.lang] ?? `no preset for language "${request.lang}" yet`;
      throw new HttpException(
        501,
        'LSP_PRESET_UNAVAILABLE',
        `preset not available for language "${request.lang}"`,
        {
          hint,
        },
      );
    }
    this.layout.ensureOrgDir(request.orgId);
    const path = this.layout.lspConfigPath(request.orgId);
    const file = readOrgLspFile(path);
    writeOrgLspFile(path, withPreset(file.raw, TYPESCRIPT_PRESET));
    return toLspListResponse(readOrgLspFile(path), true);
  }
}
