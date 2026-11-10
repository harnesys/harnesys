import { Injectable } from '@harnesys/brix';
import type { HostMethodSpec, HostServiceModule } from '../../../../domain/addons/host-service.ts';
import { serviceMethod } from '../method.ts';
import { AddonSecrets } from '../sinks.ts';

@Injectable()
export class SecretsHostService implements HostServiceModule {
  readonly namespace = 'secrets';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly secrets: AddonSecrets) {
    this.methods = [
      serviceMethod('secrets.get', undefined, async (ctx, params) => {
        const value = await this.secrets.get(ctx.orgId, ctx.addonId, params.key);
        return { value };
      }),
    ];
  }
}
