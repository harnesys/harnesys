import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { OrgSettingsPort } from '../../../../domain/skills/org-settings.port.ts';
import { serviceMethod } from '../method.ts';

@Injectable()
export class OrgHostService implements HostServiceModule {
  readonly namespace = 'org';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly settings: OrgSettingsPort) {
    this.methods = [serviceMethod('org.settings.get', undefined, (ctx) => this.getSettings(ctx))];
  }

  private async getSettings(ctx: HostCallContext): Promise<{ timezone: string }> {
    return { timezone: this.settings.get(ctx.orgId).timezone };
  }
}
