import { Injectable } from '@harnesys/brix';
import type { PluginRecordResponse, SetPluginGrantsBody } from '@harnesys/contracts';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { toListItem } from './plugin-summary.ts';

export interface SetPluginGrantsRequest {
  orgId: string;
  name: string;
  body: SetPluginGrantsBody;
}

@Injectable()
export class SetPluginGrantsUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: SetPluginGrantsRequest): Promise<PluginRecordResponse> {
    this.plugins.setGrants(request.orgId, request.name, request.body.classes);
    const record = this.plugins.findByName(request.orgId, request.name);
    if (!record) {
      throw new PluginNotFoundException(request.name);
    }
    await this.invalidate.execute({ orgId: request.orgId });
    const item = await toListItem(record);
    return { plugin: item.plugin };
  }
}
