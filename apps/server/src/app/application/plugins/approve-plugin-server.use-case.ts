import { Injectable } from '@harnesys/brix';
import type { ApprovePluginServerBody, PluginRecordResponse } from '@harnesys/contracts';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';
import { toListItem } from './plugin-summary.ts';

export interface ApprovePluginServerRequest {
  orgId: string;
  name: string;
  body: ApprovePluginServerBody;
}

@Injectable()
export class ApprovePluginServerUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: ApprovePluginServerRequest): Promise<PluginRecordResponse> {
    const current = this.plugins.findByName(request.orgId, request.name);
    if (!current) {
      throw new PluginNotFoundException(request.name);
    }
    this.plugins.approveServer(request.orgId, request.name, request.body.serverId);
    await this.invalidate.execute({ orgId: request.orgId });
    const item = await toListItem(current);
    return { plugin: item.plugin };
  }
}
