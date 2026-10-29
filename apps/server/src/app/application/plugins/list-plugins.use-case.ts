import { Injectable } from '@harnesys/brix';
import type { PluginListItem } from '@harnesys/contracts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { toListItem } from './plugin-summary.ts';

export interface ListPluginsRequest {
  orgId: string;
}

@Injectable()
export class ListPluginsUseCase {
  constructor(private readonly plugins: PluginRegistryPort) {}

  async execute(request: ListPluginsRequest): Promise<PluginListItem[]> {
    const records = this.plugins.list(request.orgId);
    return Promise.all(records.map((record) => toListItem(record)));
  }
}
