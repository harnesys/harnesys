import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { serviceMethod } from '../method.ts';

@Injectable()
export class ConfigHostService implements HostServiceModule {
  readonly namespace = 'config';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly repo: OrgAddonRepositoryPort) {
    this.methods = [serviceMethod('config.get', undefined, (ctx, params) => this.get(ctx, params))];
  }

  private async get(
    ctx: HostCallContext,
    params: { keys?: string[] },
  ): Promise<{ values: Record<string, unknown> }> {
    const row = this.repo.find(ctx.orgId, ctx.addonId);
    const all = parseConfig(row?.configJson);
    const values = params.keys ? pickKeys(all, params.keys) : all;
    return { values };
  }
}

function parseConfig(configJson: string | undefined): Record<string, unknown> {
  if (!configJson) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(configJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pickKeys(all: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in all) {
      picked[key] = all[key];
    }
  }
  return picked;
}
