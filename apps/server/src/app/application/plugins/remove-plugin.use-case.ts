import { rmSync } from 'node:fs';
import { Injectable } from '@harnesys/brix';
import { PluginNotFoundException } from '../../domain/plugin/plugin.error.ts';
import { PluginRegistryPort } from '../../domain/plugin/plugin-registry.port.ts';
import { InvalidatePluginsUseCase } from './invalidate-plugins.use-case.ts';

export interface RemovePluginRequest {
  orgId: string;
  name: string;
  deleteData?: boolean;
}

@Injectable()
export class RemovePluginUseCase {
  constructor(
    private readonly plugins: PluginRegistryPort,
    private readonly invalidate: InvalidatePluginsUseCase,
  ) {}

  async execute(request: RemovePluginRequest): Promise<void> {
    const current = this.plugins.findByName(request.orgId, request.name);
    if (!current) {
      throw new PluginNotFoundException(request.name);
    }
    this.plugins.delete(request.orgId, request.name);
    rmSync(current.path, { recursive: true, force: true });
    if (request.deleteData === true) {
      rmSync(current.dataPath, { recursive: true, force: true });
    }
    await this.invalidate.execute({ orgId: request.orgId });
  }
}
