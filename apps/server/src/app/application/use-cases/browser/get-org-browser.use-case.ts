import { Injectable } from '@harnesys/brix';
import { ENGINE_CATALOG, type EngineSpec } from 'harnesys';
import type { HostBrowserStatus } from '../../../domain/browser/browser-host.port.ts';
import { BrowserHostPort } from '../../../domain/browser/browser-host.port.ts';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';

export interface OrgBrowserView {
  engines: EngineSpec[];
  hosts: HostBrowserStatus[];
  defaultEngine: string;
}

@Injectable()
export class GetOrgBrowserUseCase {
  constructor(
    private readonly browserHost: BrowserHostPort,
    private readonly orgSettings: OrgSettingsPort,
  ) {}

  async execute(input: { orgId: string }): Promise<OrgBrowserView> {
    const [hosts, settings] = await Promise.all([
      this.browserHost.status('local'),
      Promise.resolve(this.orgSettings.get(input.orgId)),
    ]);
    return {
      engines: [...ENGINE_CATALOG],
      hosts: [hosts],
      defaultEngine: settings.browser.defaultEngine,
    };
  }
}
