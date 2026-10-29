import { Injectable } from '@harnesys/brix';
import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';

export interface GetOrgSettingsRequest {
  orgId: string;
}

@Injectable()
export class GetOrgSettingsUseCase {
  constructor(private readonly orgSettings: OrgSettingsPort) {}

  execute(request: GetOrgSettingsRequest): OrgSettings {
    return this.orgSettings.get(request.orgId);
  }
}
