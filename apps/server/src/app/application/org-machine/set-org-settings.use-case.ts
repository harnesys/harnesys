import { Injectable } from '@harnesys/brix';
import type { OrgSettings, ToolchainSettings } from '@harnesys/contracts';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';

export interface SetOrgSettingsRequest {
  orgId: string;
  patch: Partial<OrgSettings>;
}

@Injectable()
export class SetOrgSettingsUseCase {
  constructor(
    private readonly orgSettings: OrgSettingsPort,
    private readonly toolchain: ToolchainPort,
    private readonly lsp: LspPort,
  ) {}

  execute(request: SetOrgSettingsRequest): OrgSettings {
    const before = this.orgSettings.get(request.orgId);
    const after = this.orgSettings.set(request.orgId, request.patch);
    if (hasToolchainChanged(before.toolchain, after.toolchain)) {
      this.toolchain.invalidate(request.orgId);
      this.lsp.invalidateOrg(request.orgId);
    }
    return after;
  }
}

function hasToolchainChanged(before: ToolchainSettings, after: ToolchainSettings): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
